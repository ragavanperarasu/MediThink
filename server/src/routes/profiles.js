import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import mongoose from 'mongoose';
import { env } from '../env.js';
import Profile, { MAX_PROFILES, PROFILE_COLORS, RELATIONS, SEXES } from '../models/Profile.js';
import Report from '../models/Report.js';
import AdeParse from '../models/AdeParse.js';
import Conversation from '../models/Conversation.js';
import { clearProfileCookie, readProfile, setProfileCookie } from '../auth/session.js';
import { HttpError, wrap } from '../lib/http.js';
import { properCase } from '../lib/names.js';

/*
 * The profiles under the signed-in account. Every route is limited to the
 * account's own profiles; another account's profile id answers 404.
 */
const router = Router();

const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function findOwn(req, id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new HttpError(404, 'That profile does not exist.');
  const profile = await Profile.findOne({ _id: id, account: req.user._id });
  if (!profile) throw new HttpError(404, 'That profile does not exist.');
  return profile;
}

/** The editable fields from a request body, checked. `partial` allows leaving any out. */
function readFields(body, { partial }) {
  const fields = {};
  if (!partial || body?.name !== undefined) {
    const name = properCase(body?.name).slice(0, 60);
    if (!name) throw new HttpError(400, 'Enter a name for the profile.');
    fields.name = name;
  }
  if (body?.relation !== undefined) {
    if (!RELATIONS.includes(body.relation)) throw new HttpError(400, 'Choose who this profile is.');
    fields.relation = body.relation;
  }
  if (body?.sex !== undefined) {
    if (!SEXES.includes(body.sex)) throw new HttpError(400, 'That sex is not one of the choices.');
    fields.sex = body.sex;
  }
  if (body?.dateOfBirth !== undefined) {
    const dob = String(body.dateOfBirth ?? '').trim();
    if (dob && (!DATE.test(dob) || Number.isNaN(Date.parse(dob)) || new Date(dob) > new Date())) {
      throw new HttpError(400, 'Enter a real date of birth.');
    }
    fields.dateOfBirth = dob;
  }
  if (body?.color !== undefined) {
    if (!PROFILE_COLORS.includes(body.color)) throw new HttpError(400, 'That colour is not one of the choices.');
    fields.color = body.color;
  }
  return fields;
}

/** Report counts per profile, for the profile list. */
async function reportCounts(accountId) {
  const rows = await Report.aggregate([
    { $match: { account: accountId } },
    // Each report inside an upload counts once, as on the Reports list.
    { $group: { _id: '$profile', count: { $sum: { $max: [1, { $size: { $ifNull: ['$documents', []] } }] } } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

router.get(
  '/',
  wrap(async (req, res) => {
    const [profiles, counts, current] = await Promise.all([
      Profile.find({ account: req.user._id }).sort({ createdAt: 1 }),
      reportCounts(req.user._id),
      readProfile(req, req.user),
    ]);
    res.json({
      profiles: profiles.map((p) => ({ ...p.toPublic(req.user), reportCount: counts.get(String(p._id)) ?? 0 })),
      current: current ? String(current._id) : null,
    });
  }),
);

router.post(
  '/',
  wrap(async (req, res) => {
    const count = await Profile.countDocuments({ account: req.user._id });
    if (count >= MAX_PROFILES) throw new HttpError(409, `An account can hold up to ${MAX_PROFILES} profiles.`);
    const fields = readFields(req.body, { partial: false });
    const profile = await Profile.create({
      account: req.user._id,
      relation: 'other',
      color: PROFILE_COLORS[count % PROFILE_COLORS.length],
      ...fields,
    });
    res.status(201).json({ profile: { ...profile.toPublic(req.user), reportCount: 0 } });
  }),
);

router.patch(
  '/:id',
  wrap(async (req, res) => {
    const profile = await findOwn(req, req.params.id);
    Object.assign(profile, readFields(req.body, { partial: true }));
    await profile.save();
    res.json({ profile: profile.toPublic(req.user) });
  }),
);

/** Use this profile for the rest of the session. */
router.post(
  '/:id/select',
  wrap(async (req, res) => {
    const profile = await findOwn(req, req.params.id);
    setProfileCookie(res, profile);
    res.json({ profile: profile.toPublic(req.user) });
  }),
);

/** Removes the profile and every report in it, files included. The last profile cannot go. */
router.delete(
  '/:id',
  wrap(async (req, res) => {
    const profile = await findOwn(req, req.params.id);
    if (profile.primary) throw new HttpError(409, 'This is your own profile. It stays with the account.');
    if ((await Profile.countDocuments({ account: req.user._id })) <= 1) {
      throw new HttpError(409, 'An account needs at least one profile.');
    }
    const reports = await Report.find({ account: req.user._id, profile: profile._id }, { _id: 1 }).lean();
    await Report.deleteMany({ _id: { $in: reports.map((r) => r._id) } });
    await AdeParse.deleteMany({ report: { $in: reports.map((r) => r._id) } });
    await Conversation.deleteMany({ profile: profile._id });
    await Promise.all(reports.map((r) => fs.rm(path.join(env.STORAGE_DIR, String(r._id)), { recursive: true, force: true })));
    await profile.deleteOne();

    const current = req.cookies?.medithink_profile;
    if (current === String(profile._id)) clearProfileCookie(res);
    res.json({ ok: true, deletedReports: reports.length });
  }),
);

export default router;
