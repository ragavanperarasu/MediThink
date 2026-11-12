/*
 * Listening with OpenAI speech to text (gpt-transcribe by default, through
 * /api/stt): the question is recorded on the device, the end of speech is
 * found from the microphone level, and the recording is sent to be turned
 * into text. Used when the server has it set up; otherwise the browser's own
 * speech recognition listens instead (see useCloudListening below).
 */

import { sharedAudioContext } from './readAloud';

let config = null;

/** Whether the server can turn speech into text (asked once). */
export function cloudListening() {
  if (!config) {
    config = fetch('/api/stt', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((c) => Boolean(c.available) && canRecord)
      .catch(() => false);
  }
  return config;
}

export const canRecord = typeof window !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia) && typeof window.MediaRecorder !== 'undefined';

function recorderType() {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (window.MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

/**
 * Records one spoken question and returns its text ('' if nothing was said).
 *
 * Recording stops by itself after `silenceMs` of quiet once speech has
 * started, after `waitMs` if no speech starts at all, or after `maxMs`.
 * `stop()` on the returned handle ends it early and still sends what was
 * said; `cancel()` drops it. `onPhase` reports 'listening' → 'transcribing'.
 */
export function listenOnce({ language = 'en', onPhase, silenceMs = 1200, waitMs = 8000, maxMs = 30000 } = {}) {
  let stopNow = null;
  let cancelled = false;
  const controller = new AbortController();

  const done = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const ctx = sharedAudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const micSource = ctx.createMediaStreamSource(stream);
    micSource.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);

    const type = recorderType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };

    const release = () => {
      micSource.disconnect();
      stream.getTracks().forEach((track) => track.stop());
    };

    // Watch the level: a noise floor first, then speech, then the quiet after it.
    let heard = false;
    const recorded = new Promise((resolve) => {
      const began = performance.now();
      let floor = 0.01;
      let lastLoud = began;
      let ended = false;
      const finish = () => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        recorder.onstop = () => resolve();
        if (recorder.state !== 'inactive') recorder.stop();
        else resolve();
      };
      stopNow = finish;
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (const v of samples) sum += v * v;
        const level = Math.sqrt(sum / samples.length);
        const now = performance.now();
        if (now - began < 300) {
          floor = Math.max(floor, level);
          return;
        }
        if (level > Math.max(0.02, floor * 2.5)) {
          heard = true;
          lastLoud = now;
        }
        if ((heard && now - lastLoud > silenceMs) || (!heard && now - began > waitMs) || now - began > maxMs) finish();
      }, 80);
      recorder.start(250);
      onPhase?.('listening');
    });

    await recorded;
    release();
    if (cancelled || !heard || !chunks.length) return '';

    onPhase?.('transcribing');
    const form = new FormData();
    form.append('audio', new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }), 'question');
    form.append('language', language);
    const response = await fetch('/api/stt', { method: 'POST', credentials: 'same-origin', body: form, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'Could not turn the speech into text.');
    }
    const { text } = await response.json();
    return cancelled ? '' : text;
  })();

  return {
    done,
    /** Ends the recording now and sends what was said. */
    stop: () => stopNow?.(),
    /** Drops it: nothing is sent. */
    cancel: () => {
      cancelled = true;
      controller.abort();
      stopNow?.();
    },
  };
}
