import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { rateLimit } from 'express-rate-limit';
import User from '../models/User.js';
import { clearSession, issueSession, readSession } from '../auth/session.js';
import { HttpError, wrap } from '../lib/http.js';

const router = Router();

/*
 * Compared against when the username does not exist, so a wrong username
 * takes as long to reject as a wrong password and the timing does not reveal
 * which accounts exist.
 */
const DUMMY_HASH = bcrypt.hashSync('medithink-no-such-user', 12);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Wait a few minutes and try again.' },
});

router.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!username || !password) throw new HttpError(400, 'Enter your username and password.');

    const user = await User.findOne({ username });
    const matches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !matches) throw new HttpError(401, 'That username and password do not match.');

    user.lastLoginAt = new Date();
    await user.save();

    issueSession(res, user);
    res.json({ user: user.toPublic() });
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
    res.json({ user: user ? user.toPublic() : null });
  }),
);

export default router;
