import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** The server/ folder, whatever directory the process was started from. */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const isProd = process.env.NODE_ENV === 'production';

let jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  if (isProd) {
    throw new Error('JWT_SECRET must be set to 32 or more characters in production.');
  }
  // Development keeps working without one; sessions just end on every restart.
  jwtSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[env] JWT_SECRET is not set — using a temporary one. Sessions end when the server restarts.');
}

export const env = {
  isProd,
  PORT: int(process.env.PORT, 4100),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/medithink',
  JWT_SECRET: jwtSecret,
  ADMIN_USERNAME: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin@1234',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'gpt-5.6-luna',
  ANALYSIS_TIMEOUT_MS: int(process.env.ANALYSIS_TIMEOUT_MS, 120_000),
  // Read-aloud voice (OpenAI). TTS_MODEL=off uses only the device's own voice.
  TTS_MODEL: process.env.TTS_MODEL || 'gpt-4o-mini-tts',
  TTS_VOICE: process.env.TTS_VOICE || 'nova',
  // Speech to text (OpenAI). STT_MODEL=off uses only the browser's own listening.
  STT_MODEL: process.env.STT_MODEL || 'gpt-transcribe',
  STORAGE_DIR: path.resolve(SERVER_ROOT, process.env.STORAGE_DIR || './uploads'),
  MAX_UPLOAD_BYTES: int(process.env.MAX_UPLOAD_MB, 40) * 1024 * 1024,
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  TRUST_PROXY: int(process.env.TRUST_PROXY, 0),
  // LandingAI ADE: reads an uploaded PDF into text, tables and boxes.
  LANDINGAI_API_KEY: (process.env.LANDINGAI_API_KEY || '').trim(),
  // https://api.va.landing.ai, or https://api.va.eu-west-1.landing.ai for EU accounts.
  LANDINGAI_BASE_URL: (process.env.LANDINGAI_BASE_URL || 'https://api.va.landing.ai').replace(/\/+$/, ''),
  LANDINGAI_MODEL: (process.env.LANDINGAI_MODEL || 'dpt-2-latest').trim(),
  LANDINGAI_TIMEOUT_MS: int(process.env.LANDINGAI_TIMEOUT_MS, 20 * 60 * 1000),
  // "Continue with Google" — the OAuth web client ID. Empty hides the button.
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  CLIENT_DIST: path.resolve(SERVER_ROOT, '../client/dist'),
};
