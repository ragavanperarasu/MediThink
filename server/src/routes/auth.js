import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import User from '../models/User.js';
import Profile, { PROFILE_COLORS } from '../models/Profile.js';
import { clearSession, issueSession, readProfile, readSession, setProfileCookie } from '../auth/session.js';
import crypto from 'node:crypto';
import { env } from '../env.js';
import { verifyGoogleIdToken } from '../lib/google.js';
import { HttpError, wrap } from '../lib/http.js';

const router = Router();

/*
 * Sign-in is with Google only ("Continue with Google"): the first sign-in
 * creates the account and its first profile. There are no passwords.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
});

/**
 * What the client needs to know about a session: the account, its profiles,
 * and which profile is in use (null until one is chosen, when there are
 * several). An account with one profile has it chosen automatically.
 */
async function sessionPayload(req, res, user, chosen) {
  const profiles = await Profile.find({ account: user._id }).sort({ createdAt: 1 });
  const profile = chosen ?? (await readProfile(req, user));
  if (profile) setProfileCookie(res, profile);
  return {
    user: user.toPublic(),
    profile: profile ? profile.toPublic(user) : null,
    profiles: profiles.map((p) => p.toPublic(user)),
  };
}

/** What the sign-in page needs to know: whether "Continue with Google" is available. */
router.get('/config', (req, res) => {
  res.json({ googleClientId: env.GOOGLE_CLIENT_ID || null });
});

/**
 * "Continue with Google". The posted credential is Google's ID token; once
 * verified, the account is found by its Google id, or by its email (Google
 * has verified it, so an existing email account is linked), or created —
 * with its first profile — on the first sign-in.
 */
router.post(
  '/google',
  loginLimiter,
  wrap(async (req, res) => {
    const google = await verifyGoogleIdToken(req.body?.credential);

    let user = await User.findOne({ googleId: google.googleId });
    if (!user) {
      user = await User.findOne({ $or: [{ email: google.email }, { username: google.email }] });
      if (user) {
        user.googleId = google.googleId;
        if (!user.email) user.email = google.email;
      }
    }
    if (user && google.picture) user.picture = google.picture;
    let created = false;
    if (!user) {
      user = new User({
        username: google.email,
        email: google.email,
        googleId: google.googleId,
        picture: google.picture,
        displayName: google.name,
        role: 'user',
        // No password is set: this account signs in with Google. A random,
        // unknown hash keeps the email + password route closed for it.
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12),
      });
      created = true;
    }
    user.lastLoginAt = new Date();
    await user.save();

    let profile = null;
    if (created) {
      profile = await Profile.create({ account: user._id, name: google.name, relation: 'self', color: PROFILE_COLORS[0], primary: true });
    }

    issueSession(res, user);
    req.cookies = { ...req.cookies, medithink_profile: undefined };
    res.status(created ? 201 : 200).json(await sessionPayload(req, res, user, profile));
  }),
);

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get(
  '/me',
  wrap(async (req, res) => {
    const user = await readSession(req);
    if (!user) return res.json({ user: null, profile: null, profiles: [] });
    return res.json(await sessionPayload(req, res, user));
  }),
);

export default router;
