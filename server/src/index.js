import fs from 'node:fs/promises';
import { env } from './env.js';
import { connectDb } from './db.js';
import { seedAdmin } from './auth/seed.js';
import { createApp } from './app.js';
import Report from './models/Report.js';

async function main() {
  await fs.mkdir(env.STORAGE_DIR, { recursive: true });
  await connectDb();
  await seedAdmin();

  // An analysis running when the server last stopped will never finish.
  const { modifiedCount } = await Report.updateMany(
    { status: 'analysing' },
    { $set: { status: 'failed', error: 'The server restarted while this report was being analysed. Run the analysis again.' } },
  );
  if (modifiedCount) console.log(`[boot] marked ${modifiedCount} interrupted analyses as failed`);

  if (!env.OPENAI_API_KEY) console.warn('[boot] OPENAI_API_KEY is not set — reports will upload but cannot be analysed.');

  createApp().listen(env.PORT, () => {
    console.log(`[boot] MediThink API on http://localhost:${env.PORT} (model ${env.ANALYSIS_MODEL})`);
  });
}

main().catch((err) => {
  console.error('[boot] failed to start:', err);
  process.exit(1);
});
