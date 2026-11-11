import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import User from '../models/User.js';

const COOKIE = 'medithink_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/*
 * The session lives in an httpOnly cookie only. The client is always served
 * from the same origin as the API — Vite proxies /api in development and the
 * server serves the built client in production — so no token ever needs to be
 * readable by JavaScript.
 */
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProd,
  path: '/',
});

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), role: user.role }, env.JWT_SECRET, {
    expiresIn: Math.floor(MAX_AGE_MS / 1000),
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

/** The signed-in user, or null. Never throws for a missing or expired session. */
export async function readSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return await User.findById(payload.sub);
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const user = await readSession(req);
    if (!user) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}
