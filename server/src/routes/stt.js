import { Router } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import OpenAI, { toFile } from 'openai';
import { env } from '../env.js';
import { HttpError, wrap } from '../lib/http.js';
import { LANGUAGES, languageOf } from '../lib/languages.js';

/*
 * Speech to text: a recorded question (a few seconds of audio from the
 * browser's MediaRecorder — webm/opus, or mp4 on Safari) turned into text by
 * OpenAI, so listening works the same on every phone.
 *
 * GET  /api/stt          → { available, model }
 * POST /api/stt (multipart: audio, language) → { text }
 * 503 means it is not set up (no OpenAI key, or STT_MODEL=off); the browser
 * then listens with its own speech recognition.
 */
const router = Router();

const openai = env.OPENAI_API_KEY && env.STT_MODEL !== 'off' ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

// A spoken question is short; 30 s of opus is well under 1 MB.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 4 } }).single('audio');

const sttLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests in a minute. Wait a moment and try again.' },
});

// Whisper-family language codes; Odia is not one, so it is left to detection.
const LANGUAGE_HINT = new Set(['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'ml']);

/** Words the person is likely to say, so medical terms come back spelled right. */
const PROMPT = 'A patient asking about their medical report: haemoglobin, platelets, WBC, RBC, cholesterol, LDL, HDL, triglycerides, creatinine, urea, HbA1c, glucose, thyroid, TSH, vitamin D, B12, ferritin, ECG, echo.';

router.get('/', (req, res) => {
  res.json({ available: Boolean(openai), model: openai ? env.STT_MODEL : null });
});

router.post(
  '/',
  sttLimiter,
  upload,
  wrap(async (req, res) => {
    if (!openai) throw new HttpError(503, 'Speech to text is not set up.');
    const audio = req.file;
    if (!audio?.buffer?.length) throw new HttpError(400, 'No audio was received.');

    // The answer language decides the hint; English is left to detection, since
    // someone who reads English may still ask in their own language.
    const code = languageOf(req.body?.language);
    const type = (audio.mimetype || 'audio/webm').split(';')[0];
    const ext = type.includes('mp4') || type.includes('m4a') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm';

    const transcribe = async (language) => openai.audio.transcriptions.create(
      {
        file: await toFile(audio.buffer, `question.${ext}`, { type }),
        model: env.STT_MODEL,
        prompt: code === 'en' ? PROMPT : `${PROMPT} The question may be in ${LANGUAGES[code].name}.`,
        ...(language ? { language } : {}),
      },
      { timeout: 30_000 },
    );

    let result;
    try {
      result = await transcribe(LANGUAGE_HINT.has(code) ? code : undefined);
    } catch (err) {
      // A language the model will not take as a hint: let it detect instead.
      if (err?.status === 400 && LANGUAGE_HINT.has(code)) result = await transcribe(undefined);
      else throw new HttpError(502, `Could not turn the speech into text: ${err?.message || 'no response'}`);
    }
    res.json({ text: String(result?.text ?? '').trim() });
  }),
);

export default router;
