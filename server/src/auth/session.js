import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Profile from '../models/Profile.js';

const COOKIE = 'medithink_session';
/** Which of the account's profiles is in use. Checked against the account on every request. */
const PROFILE_COOKIE = 'medithink_profile';
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
  res.clearCookie(PROFILE_COOKIE, cookieOptions());
}

/* ── profiles ─────────────────────────────────────────────────────────── */

export function setProfileCookie(res, profile) {
  res.cookie(PROFILE_COOKIE, String(profile._id), { ...cookieOptions(), maxAge: MAX_AGE_MS });
}

export function clearProfileCookie(res) {
  res.clearCookie(PROFILE_COOKIE, cookieOptions());
}

/**
 * The profile this session is using, or null when none is chosen yet.
 *
 * The cookie only names a profile; it counts only when that profile belongs
 * to the signed-in account, so it can never open someone else's reports. An
 * account with a single profile needs no choice — that one is used.
 */
export async function readProfile(req, user) {
  const id = req.cookies?.[PROFILE_COOKIE];
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    const chosen = await Profile.findOne({ _id: id, account: user._id });
    if (chosen) return chosen;
  }
  const profiles = await Profile.find({ account: user._id }).limit(2);
  return profiles.length === 1 ? profiles[0] : null;
}

/** After requireAuth: sets req.profile, or answers 428 so the client asks who it is for. */
export async function requireProfile(req, res, next) {
  try {
    const profile = await readProfile(req, req.user);
    if (!profile) {
      return res.status(428).json({ error: 'Choose a profile first.', code: 'PROFILE_REQUIRED' });
    }
    req.profile = profile;
    return next();
  } catch (err) {
    return next(err);
  }
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
