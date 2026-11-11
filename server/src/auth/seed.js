import bcrypt from 'bcryptjs';
import { env } from '../env.js';
import User from '../models/User.js';

/**
 * Makes the admin account match .env.
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
