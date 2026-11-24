import * as api from '../api';

/*
 * A GPT-Live voice session over WebRTC. The microphone goes straight to
 * OpenAI and its voice comes straight back, so it can be interrupted mid-
 * sentence like a person. Our server only starts the session (it holds the API
 * key and adds the report context); events — transcripts, session start and
 * end, errors — arrive on the "oai-events" data channel.
 */

export const canLive =
  typeof window !== 'undefined' && 'RTCPeerConnection' in window && Boolean(navigator.mediaDevices?.getUserMedia);

const aborted = () => Object.assign(new Error('Voice conversation closed.'), { name: 'AbortError' });

/** Waits until the offer carries all its network candidates (or 3 s). */
function iceGathered(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', done);
      resolve();
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 3000);
  });
}

/**
 * Connects and returns { mute(on), close() }. `onEvent` gets every server
 * event as parsed JSON, plus { type: 'connection.lost' } if the link drops.
 * `connect(sdp, signal)` hands the browser's offer to our server and resolves
 * with { sdp } — the Assistant's by default, about `scope`; the daily
 * check-in passes its own. Aborting `signal` before it connects releases the
 * microphone and throws.
 */
export async function startLive({ scope, language, connect, onEvent, signal }) {
  const mic = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;

  const release = () => {
    pc.close();
    mic.getTracks().forEach((t) => t.stop());
    audio.srcObject = null;
  };

  try {
    if (signal?.aborted) throw aborted();
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0];
      audio.play().catch(() => {});
    };
    const [track] = mic.getAudioTracks();
    pc.addTrack(track, mic);

    const channel = pc.createDataChannel('oai-events');
    // A greeting from our server is handed to the voice to say first, as soon
    // as the session is up — otherwise it waits for the person to speak.
    let greeting = '';
    channel.onmessage = (message) => {
      let event;
      try { event = JSON.parse(message.data); } catch { return; /* not JSON: ignore */ }
      if (event.type === 'session.started' && greeting) {
        channel.send(JSON.stringify({ type: 'session.commentary.append', event_id: `greet_${Date.now()}`, delegation_id: null, content: greeting }));
        greeting = '';
      }
      // A refused greeting is not worth an error on screen: the person just speaks first.
      if (event.type === 'error' && String(event.error?.client_event_id ?? '').startsWith('greet_')) {
        console.warn('[live] greeting not accepted:', event.error?.message);
        return;
      }
      onEvent(event);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') onEvent({ type: 'connection.lost' });
    };

    await pc.setLocalDescription(await pc.createOffer());
    await iceGathered(pc);
    if (signal?.aborted) throw aborted();

    const offer = pc.localDescription.sdp;
    const answer = connect ? await connect(offer, signal) : await api.startLive(scope, language, offer, signal);
    const { sdp } = answer;
    greeting = answer.greeting || '';
    if (signal?.aborted) throw aborted();
    await pc.setRemoteDescription({ type: 'answer', sdp });

    return {
      mute(on) { track.enabled = !on; },
      close() {
        // Ask OpenAI to end the session (and its billing) cleanly, then hang up.
        try {
          if (channel.readyState === 'open') channel.send(JSON.stringify({ type: 'session.close', event_id: `close_${Date.now()}` }));
        } catch { /* already closed */ }
        setTimeout(release, 200);
      },
    };
  } catch (err) {
    release();
    throw err;
  }
}
