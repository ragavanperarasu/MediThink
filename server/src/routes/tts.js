import crypto from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import OpenAI from 'openai';
import { env } from '../env.js';
import { HttpError, wrap } from '../lib/http.js';
import { LANGUAGES, languageOf } from '../lib/languages.js';

/*
 * Read-aloud voice: a piece of an answer (a sentence or two) turned into
 * speech by OpenAI, so it sounds the same on every phone.
 *
 * The audio is raw PCM — 16-bit, mono, 24 kHz — streamed to the browser as
 * OpenAI produces it, so the browser starts playing within about a second
 * instead of waiting for a whole file. Each piece is kept in a small memory
 * cache: replaying an answer costs nothing.
 *
 * 503 means no voice is set up (no OpenAI key, or TTS_MODEL=off); the browser
 * then uses the device's own voice.
 */
const router = Router();

const openai = env.OPENAI_API_KEY && env.TTS_MODEL !== 'off' ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const MAX_CHARS = 1000;
export const PCM_RATE = 24_000;

/* ── cache: the most recent pieces, up to about 40 MB ─────────────────── */

const CACHE_BYTES = 40 * 1024 * 1024;
const cache = new Map();
let cachedBytes = 0;

function remember(key, audio) {
  if (audio.length > CACHE_BYTES / 4) return;
  cache.set(key, audio);
  cachedBytes += audio.length;
  for (const [oldKey, old] of cache) {
    if (cachedBytes <= CACHE_BYTES) break;
    cache.delete(oldKey);
    cachedBytes -= old.length;
  }
}

function recall(key) {
  const audio = cache.get(key);
  if (audio) {
    // Most recently used goes to the back.
    cache.delete(key);
    cache.set(key, audio);
  }
  return audio;
}

/* ── route ────────────────────────────────────────────────────────────── */

const ttsLimiter = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests in a minute. Wait a moment and try again.' },
});

/** How the voice is asked to speak: the language, and a calm, clear manner. */
function instructionsFor(code) {
  const lang = LANGUAGES[code];
  const accent = code === 'en' ? 'Indian English' : `${lang.name}, with natural ${lang.name} pronunciation`;
  return `Speak in ${accent}. Calm, warm and clear, at an unhurried pace, like a kind doctor explaining a medical report to a family. Say medical test names and units clearly.`;
}

/** POST /api/tts { text, language } → audio/L16 (PCM, 24 kHz, mono), streamed. */
router.post(
  '/',
  ttsLimiter,
  wrap(async (req, res) => {
    if (!openai) throw new HttpError(503, 'No read-aloud voice is set up.');
    const text = String(req.body?.text ?? '').trim();
    if (!text) throw new HttpError(400, 'Nothing to read.');
    if (text.length > MAX_CHARS) throw new HttpError(400, 'That is too long to read in one go.');
    const language = languageOf(req.body?.language);

    const key = crypto.createHash('sha256').update([env.TTS_MODEL, env.TTS_VOICE, language, text].join('\u0000')).digest('hex');
    res.set({
      'Content-Type': `audio/L16; rate=${PCM_RATE}; channels=1`,
      'Cache-Control': 'private, max-age=86400',
      'X-Accel-Buffering': 'no',
    });

    const cached = recall(key);
    if (cached) {
      res.end(cached);
      return;
    }

    const controller = new AbortController();
    let done = false;
    res.on('close', () => { if (!done) controller.abort(); });

    const speech = await openai.audio.speech.create(
      {
        model: env.TTS_MODEL,
        voice: env.TTS_VOICE,
        input: text,
        response_format: 'pcm',
        ...(env.TTS_MODEL.startsWith('gpt-') ? { instructions: instructionsFor(language) } : {}),
      },
      { signal: controller.signal, timeout: 30_000 },
    );

    res.flushHeaders();
    const chunks = [];
    try {
      for await (const chunk of speech.body) {
        const piece = Buffer.from(chunk);
        chunks.push(piece);
        res.write(piece);
      }
    } catch (err) {
      // The listener moved on (stopped, or skipped ahead): nothing to keep.
      if (controller.signal.aborted) return;
      throw err;
    }
    done = true;
    res.end();
    remember(key, Buffer.concat(chunks));
  }),
);

export default router;
