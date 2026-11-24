import crypto from 'node:crypto';
import { env } from '../env.js';
import { HttpError } from './http.js';

/*
 * Starts an OpenAI GPT-Live voice session for the browser. The browser sends
 * its WebRTC offer here; the session is started with our instructions and
 * OpenAI's answer goes back. Audio then flows directly between the browser
 * and OpenAI — speech in, speech out. The API key never leaves the server.
 */
const LIVE_URL = 'https://api.openai.com/v1/live/sessions';

/** Throws unless live voice is set up. */
export function assertLive() {
  if (!env.OPENAI_API_KEY || env.LIVE_MODEL === 'off') throw new HttpError(503, 'Live voice is not set up on the server.');
}

/** The browser's offer, checked. */
export function offerFrom(body) {
  const sdp = String(body?.sdp ?? '');
  if (!sdp.startsWith('v=0') || sdp.length > 50_000) throw new HttpError(400, 'The browser did not send a valid connection offer.');
  return sdp;
}

/** → { sdp, sessionId } */
export async function startLiveSession({ sdp, instructions, userId, tag = 'live' }) {
  const session = {
    model: env.LIVE_MODEL,
    instructions,
    audio: { output: { voice: env.LIVE_VOICE } },
    // A hash, not the account id itself: OpenAI uses it only for abuse monitoring.
    safety_identifier: crypto.createHash('sha256').update(String(userId)).digest('hex'),
  };

  const response = await fetch(LIVE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, transport: { type: 'webrtc', sdp } }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.transport?.sdp) {
    console.error(`[${tag}] ${response.status}:`, body?.error?.message ?? body);
    throw new HttpError(502, `Live voice could not start: ${body?.error?.message || `OpenAI answered ${response.status}`}`);
  }
  console.log(`[${tag}] ${body.session?.id} started (${env.LIVE_MODEL}, ${instructions.length} chars of instructions)`);
  return { sdp: body.transport.sdp, sessionId: body.session?.id ?? '' };
}
