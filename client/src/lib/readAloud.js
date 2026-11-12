/*
 * Copy and Speak for an Assistant answer. Both work from the answer's
 * Markdown turned into plain text. Speak uses the cloud voice (OpenAI,
 * through /api/tts) so it sounds the same on every phone, and falls back to
 * the browser's own voices (speechSynthesis) when that is not available.
 */

/** Markdown → plain text: no citation tags, no ** or #, a table as one line per row. */
export function plainText(markdown) {
  return String(markdown ?? '')
    .replace(/\s*\[(?:[CD]\d{1,5}\s*[,;]?\s*)+\]/g, '') // [C12] [D3]
    .split('\n')
    .filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line)) // table separator rows
    .map((line) => {
      let text = line.trim();
      if (text.startsWith('|')) {
        text = text.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).filter(Boolean).join(' | ');
      }
      return text
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*]\s+/, '• ')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/(^|\s)[_*](.+?)[_*](?=\s|$|[.,;:])/g, '$1$2');
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Copies text, with a fallback for browsers without the async clipboard. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/*
 * Which voice to read with, from the script the answer is written in.
 * Devanagari is Hindi or Marathi; the chosen answer language decides.
 */
const SCRIPTS = [
  [/[஀-௿]/, 'ta-IN'],
  [/[ఀ-౿]/, 'te-IN'],
  [/[ಀ-೿]/, 'kn-IN'],
  [/[ഀ-ൿ]/, 'ml-IN'],
  [/[ঀ-৿]/, 'bn-IN'],
  [/[઀-૿]/, 'gu-IN'],
  [/[଀-୿]/, 'or-IN'],
  [/[؀-ۿ]/, 'ur-IN'],
];

function speechLang(text, chosen) {
  for (const [script, lang] of SCRIPTS) if (script.test(text)) return lang;
  if (/[ऀ-ॿ]/.test(text)) return chosen === 'mr' ? 'mr-IN' : 'hi-IN';
  return 'en-IN';
}

function voiceFor(lang) {
  const voices = window.speechSynthesis.getVoices();
  const norm = (v) => v.lang.replace('_', '-').toLowerCase();
  return voices.find((v) => norm(v) === lang.toLowerCase())
    ?? voices.find((v) => norm(v).startsWith(lang.slice(0, 2).toLowerCase()))
    ?? null;
}

/** Text split into short pieces to read; tables read as lists, a pause at each line end. */
function piecesOf(text) {
  return text
    .replace(/•/g, '')
    .replace(/ \| /g, ', ') // a table row reads as a list, not "vertical bar"
    .replace(/([^.!?।؟:\n])\n/g, '$1.\n') // a pause at the end of every line
    .split(/(?<=[.!?।؟\n])\s+/)
    .flatMap((part) => part.match(/[\s\S]{1,220}(?:\s|$)/g) ?? [])
    .map((part) => part.trim())
    .filter(Boolean);
}

function utterance(piece, chosen) {
  const lang = speechLang(piece, chosen);
  const voice = voiceFor(lang);
  const u = new SpeechSynthesisUtterance(piece);
  u.lang = lang;
  if (voice) u.voice = voice;
  u.rate = 0.95;
  return u;
}

/* ── the cloud voice: OpenAI through /api/tts, the same on every phone ── */

const PCM_RATE = 24_000; // the server streams 16-bit mono PCM at this rate
let cloudOff = false; // set once the server says no voice is set up
let audioContext = null;
let current = null; // the speaker reading now; only one at a time

function context() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioContext = Ctx ? new Ctx() : null;
  }
  return audioContext;
}

/** The page's one audio context, unlocked by unlockSpeech(); listening measures the mic with it too. */
export const sharedAudioContext = () => context();

function fetchVoice(text, language, signal) {
  return fetch('/api/tts', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    signal,
  });
}

/** The first piece is kept short, so the voice starts sooner. */
function shortenFirst(pieces) {
  const [first, ...rest] = pieces;
  if (!first || first.length <= 90) return pieces;
  const cut = Math.max(first.lastIndexOf(', ', 90), first.lastIndexOf(' ', 90));
  return cut > 20 ? [first.slice(0, cut + 1).trim(), first.slice(cut + 1).trim(), ...rest] : pieces;
}

/**
 * Reads text aloud. Long text is read in short pieces. `onEnd` runs when it
 * finishes or is stopped.
 */
export function speak(text, { chosen = 'en', onEnd } = {}) {
  const speaker = createSpeaker({ chosen, onDone: onEnd, onStop: onEnd });
  speaker.push(text);
  speaker.finish();
}

/**
 * Reads an answer while it is still arriving: push() each new piece of text
 * as it comes, finish() when there is no more. `onDone` runs once everything
 * pushed has been read; stop() ends it early (then `onStop` runs instead).
 *
 * Each piece is fetched from the cloud voice — up to three ahead of the one
 * playing — and its audio is played chunk by chunk as it streams in, back to
 * back with the piece before. A piece the cloud voice cannot read is read by
 * the device's own voice instead.
 */
export function createSpeaker({ chosen = 'en', onDone, onStop } = {}) {
  current?.stop();
  const ctx = context();
  const controller = new AbortController();
  const jobs = [];
  const sources = new Set();
  let nextTime = 0;
  let started = false;
  let finished = false;
  let running = false;
  let over = false;

  const untilPlayed = () => new Promise((resolve) => {
    const left = ctx ? Math.max(0, nextTime - ctx.currentTime) : 0;
    setTimeout(resolve, left * 1000 + 30);
  });

  /** Schedules a streamed piece's audio, chunk by chunk, right after what is already queued. */
  async function playStream(response) {
    const reader = response.body.getReader();
    let carry = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done || over) break;
      let bytes = value;
      if (carry) {
        bytes = new Uint8Array(carry.length + value.length);
        bytes.set(carry);
        bytes.set(value, carry.length);
        carry = null;
      }
      const usable = bytes.length - (bytes.length % 2);
      if (usable < bytes.length) carry = bytes.slice(usable);
      if (!usable) continue;
      const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable));
      const buffer = ctx.createBuffer(1, samples.length, PCM_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i += 1) channel[i] = samples[i] / 32768;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      // Starting from silence, keep a little audio in hand so a slow chunk does not stutter.
      const at = Math.max(nextTime, ctx.currentTime + (nextTime < ctx.currentTime ? 0.12 : 0.02));
      source.start(at);
      nextTime = at + buffer.duration;
      sources.add(source);
      source.onended = () => sources.delete(source);
    }
  }

  /** The device's own voice, after whatever cloud audio is still playing. */
  async function deviceSpeak(text) {
    await untilPlayed();
    if (over || !canSpeak) return;
    await new Promise((resolve) => {
      const u = utterance(text, chosen);
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  async function run() {
    if (running) return;
    running = true;
    try {
      // Never wait long for audio to unlock: a phone that refuses still gets the device voice.
      if (ctx?.state === 'suspended') await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
      while (jobs.length && !over) {
        jobs.slice(0, 3).forEach((job) => job.start());
        const job = jobs.shift();
        const response = await job.start();
        if (over) break;
        if (response?.ok && ctx && ctx.state === 'running') {
          try {
            await playStream(response);
          } catch {
            if (!over) await deviceSpeak(job.text);
          }
        } else {
          if (response?.status === 503) cloudOff = true;
          await deviceSpeak(job.text);
        }
      }
    } finally {
      running = false;
    }
    if (finished && !jobs.length && !over) {
      await untilPlayed();
      if (!over && !jobs.length) {
        over = true;
        if (current === speaker) current = null;
        onDone?.();
      }
    }
  }

  const speaker = {
    push(text) {
      if (over) return;
      let pieces = piecesOf(text);
      if (!started) pieces = shortenFirst(pieces);
      if (pieces.length) started = true;
      for (const piece of pieces) {
        let response = null;
        jobs.push({
          text: piece,
          start: () => {
            if (!response) {
              response = cloudOff || !ctx
                ? Promise.resolve(null)
                : fetchVoice(piece, chosen, controller.signal).catch(() => null);
            }
            return response;
          },
        });
      }
      run();
    },
    finish() {
      finished = true;
      run();
    },
    stop() {
      if (over) return;
      over = true;
      controller.abort();
      sources.forEach((source) => { try { source.stop(); } catch { /* already ended */ } });
      sources.clear();
      if (canSpeak) window.speechSynthesis.cancel();
      if (current === speaker) current = null;
      onStop?.();
    },
  };
  current = speaker;
  return speaker;
}

/**
 * Some phones only play sound that a tap starts; call this on the tap that
 * opens voice mode or presses Speak.
 */
export function unlockSpeech() {
  const ctx = context();
  if (ctx) {
    ctx.resume().catch(() => {});
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, 22_050);
    source.connect(ctx.destination);
    source.start(0);
  }
  if (canSpeak) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
  }
}

export function stopSpeaking() {
  current?.stop();
  if (canSpeak) window.speechSynthesis.cancel();
}
