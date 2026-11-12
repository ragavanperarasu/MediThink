import bcrypt from 'bcryptjs';
import { env } from '../env.js';
import User from '../models/User.js';
import Profile, { PROFILE_COLORS } from '../models/Profile.js';
import Report from '../models/Report.js';
import { properCase } from '../lib/names.js';

/**
 * Makes the admin account match .env. It signs in with a username, not an email.
 *
 * Run at every boot, so the password in .env is always the one that works —
 * changing it there and restarting is how it is changed. The hash is only
 * rewritten when it no longer matches, so a normal restart writes nothing.
 */
export async function seedAdmin() {
  const username = env.ADMIN_USERNAME;
  const existing = await User.findOne({ username });

  if (existing && (await bcrypt.compare(env.ADMIN_PASSWORD, existing.passwordHash))) return;

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  await User.updateOne(
    { username },
    { $set: { passwordHash, role: 'admin' }, $setOnInsert: { displayName: 'Administrator' } },
    { upsert: true },
  );
  console.log(`[auth] admin account "${username}" ${existing ? 'password updated' : 'created'}`);
}

/**
 * Brings data from before profiles existed into the profile model. Safe to
 * run at every boot; it only touches what is missing.
 *
 * 1. Every account has at least one profile — its own, named after it.
 * 2. Every report belongs to an account and a profile: the profile of the
 *    account that uploaded it, or the admin's when that is not recorded.
 */
export async function migrateProfiles() {
  const users = await User.find({}, { _id: 1, displayName: 1, username: 1, role: 1 });
  const firstProfile = new Map();
  for (const user of users) {
    let profile = await Profile.findOne({ account: user._id }).sort({ createdAt: 1 });
    if (!profile) {
      profile = await Profile.create({
        account: user._id,
        name: user.displayName || user.username,
        relation: 'self',
        color: PROFILE_COLORS[0],
        primary: true,
      });
      console.log(`[profiles] created the first profile for "${user.username}"`);
    }
    // Accounts from before `primary` existed: their first profile is their own.
    if (!(await Profile.exists({ account: user._id, primary: true }))) {
      await Profile.updateOne({ _id: profile._id }, { $set: { primary: true } });
    }
    firstProfile.set(String(user._id), profile);
  }

  // Names saved before Proper Case was applied.
  let renamed = 0;
  for (const profile of await Profile.find({}, { name: 1 })) {
    const proper = properCase(profile.name);
    if (proper && proper !== profile.name) {
      await Profile.updateOne({ _id: profile._id }, { $set: { name: proper } });
      renamed += 1;
    }
  }
  for (const user of users) {
    const proper = properCase(user.displayName);
    if (proper && proper !== user.displayName) await User.updateOne({ _id: user._id }, { $set: { displayName: proper } });
  }
  if (renamed) console.log(`[profiles] put ${renamed} profile name${renamed === 1 ? '' : 's'} in Proper Case`);

  const admin = users.find((u) => u.username === env.ADMIN_USERNAME) ?? users.find((u) => u.role === 'admin');
  const orphans = await Report.find({ profile: { $exists: false } }, { _id: 1, createdBy: 1 }).lean();
  let moved = 0;
  for (const report of orphans) {
    const ownerId = report.createdBy && firstProfile.has(String(report.createdBy)) ? String(report.createdBy) : admin && String(admin._id);
    const profile = ownerId && firstProfile.get(ownerId);
    if (!profile) continue;
    await Report.updateOne({ _id: report._id }, { $set: { account: profile.account, profile: profile._id } });
    moved += 1;
  }
  if (moved) console.log(`[profiles] moved ${moved} earlier report${moved === 1 ? '' : 's'} into their account's first profile`);
}
