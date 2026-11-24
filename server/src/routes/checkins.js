import { Router } from 'express';
import mongoose from 'mongoose';
import { rateLimit } from 'express-rate-limit';
import CheckIn from '../models/CheckIn.js';
import { checkinSession, dayOf, doctorNote, fillKnowledge, noteCheckin } from '../lib/checkin.js';
import { HttpError, wrap } from '../lib/http.js';
import { languageOf } from '../lib/languages.js';
import { assertLive, offerFrom, startLiveSession } from '../lib/live.js';
import { env } from '../env.js';

/*
 * The daily check-in, for the profile in use (lib/checkin.js): a short voice
 * chat, its notes per day, and a note for the next doctor visit.
 */
const router = Router();

const own = (req) => ({ account: req.user._id, profile: req.profile._id });
const RECENT_DAYS = 14;

const modelLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests in a minute. Wait a moment and try again.' },
});

/** GET /api/checkins → { today, recent, live } — today's check-in (or null) and the last two weeks'. */
router.get(
  '/',
  wrap(async (req, res) => {
    // Older reports get their fact sheets in the background, ready for the next chat.
    fillKnowledge(own(req));
    const today = dayOf();
    const recent = await CheckIn.find({ profile: req.profile._id }).sort({ day: -1 }).limit(RECENT_DAYS);
    // Notes that could not be written last time are tried again.
    await Promise.all(recent.filter((c) => !c.noted && c.turns.length).slice(0, 2).map(noteCheckin));
    res.json({
      today: recent.find((c) => c.day === today)?.toPublic() ?? null,
      recent: recent.filter((c) => c.day !== today && c.points.length).map((c) => c.toPublic()),
      live: Boolean(env.OPENAI_API_KEY) && env.LIVE_MODEL !== 'off',
    });
  }),
);

/** POST /api/checkins/live { language, sdp } → { sdp, sessionId, greeting } — starts today's voice chat; the browser has it say `greeting` first. */
router.post(
  '/live',
  modelLimiter,
  wrap(async (req, res) => {
    assertLive();
    const sdp = offerFrom(req.body);
    const { instructions, greeting } = await checkinSession(req.profile, own(req), languageOf(req.body?.language));
    res.json({ ...(await startLiveSession({ sdp, instructions, userId: req.user._id, tag: 'checkin' })), greeting });
  }),
);

/**
 * POST /api/checkins { language, turns: [{ role, content }] } → { checkin } —
 * what was said, as the browser heard it transcribed. Added to today's
 * check-in, whose notes are then written again from everything said today.
 */
router.post(
  '/',
  modelLimiter,
  wrap(async (req, res) => {
    const turns = (Array.isArray(req.body?.turns) ? req.body.turns : [])
      .slice(0, 200)
      .map((t) => ({
        role: t?.role === 'assistant' || t?.role === 'user' ? t.role : null,
        content: String(t?.content ?? '').trim().slice(0, 4000),
        at: new Date(),
      }))
      .filter((t) => t.role && t.content);
    const day = dayOf();
    if (!turns.some((t) => t.role === 'user')) {
      // Nothing was said: today's check-in stays as it was.
      const existing = await CheckIn.findOne({ profile: req.profile._id, day });
      res.json({ checkin: existing?.toPublic() ?? null, empty: true });
      return;
    }
    const checkin = await CheckIn.findOneAndUpdate(
      { profile: req.profile._id, day },
      {
        $setOnInsert: { account: req.user._id },
        $set: { language: languageOf(req.body?.language), noted: false },
        $push: { turns: { $each: turns } },
      },
      { upsert: true, returnDocument: 'after' },
    );
    await noteCheckin(checkin);
    res.json({ checkin: checkin.toPublic() });
  }),
);

/** GET /api/checkins/doctor-note?days=30 → the last days' check-ins, gathered for the doctor. */
router.get(
  '/doctor-note',
  modelLimiter,
  wrap(async (req, res) => {
    const days = [7, 14, 30, 90].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
    try {
      res.json(await doctorNote(req.profile._id, days));
    } catch (err) {
      console.error(`[checkin] doctor note for ${req.profile._id}:`, err.message);
      throw new HttpError(502, 'The doctor note could not be written just now. Try again in a moment.');
    }
  }),
);

/** DELETE /api/checkins/:id — removes one day's check-in. */
router.delete(
  '/:id',
  wrap(async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new HttpError(404, 'Check-in not found.');
    const { deletedCount } = await CheckIn.deleteOne({ _id: req.params.id, profile: req.profile._id });
    if (!deletedCount) throw new HttpError(404, 'Check-in not found.');
    res.json({ ok: true });
  }),
);

export default router;
