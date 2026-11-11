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
  STORAGE_DIR: path.resolve(SERVER_ROOT, process.env.STORAGE_DIR || './uploads'),
  MAX_UPLOAD_BYTES: int(process.env.MAX_UPLOAD_MB, 40) * 1024 * 1024,
  TIMEZONE: process.env.TIMEZONE || 'Asia/Kolkata',
  TRUST_PROXY: int(process.env.TRUST_PROXY, 0),
  CLIENT_DIST: path.resolve(SERVER_ROOT, '../client/dist'),
};
