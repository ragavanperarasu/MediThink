import crypto from 'node:crypto';
import { env } from '../env.js';
import CheckIn from '../models/CheckIn.js';
import Report from '../models/Report.js';
import { complete, documentKnowledge } from './analyse.js';
import { LANGUAGES, languageOf } from './languages.js';
import { CHECKIN_NOTES_PROMPT, CHECKIN_PROMPT, DOCTOR_NOTE_PROMPT } from './prompts.js';
import { REPORT_TYPE_LABEL } from './reportTypes.js';

/*
 * The daily check-in. A short GPT-Live voice chat about how the person is
 * today, guided by a fact sheet of each of their reports (written by the
 * analysis model, KNOWLEDGE_PROMPT) and by their last few check-ins. What
 * the person said is turned into a few short notes, kept per day, and
 * gathered into a note for the next doctor visit.
 */

/** Fact sheets for every report fit in GPT-Live's 16,384-token instructions with room to spare. */
const MAX_FACTS_CHARS = 32_000;
const RECENT_CHECKINS = 7;
const MAX_TRANSCRIPT_CHARS = 24_000;
const FEELINGS = new Set(['good', 'okay', 'unwell']);
const FLAGGED = new Set(['high', 'low', 'abnormal']);

/** "YYYY-MM-DD" in the app's time zone. */
export const dayOf = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: env.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

const longDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: env.TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);

/** "2026-11-24" → "Tue 24 Nov". */
const shortDay = (day) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${day}T00:00:00Z`));

const readable = (doc) => doc && doc.status !== 'failed' && Boolean(doc.summary);
const withoutCitations = (text) => String(text ?? '').replace(/\s*\[(?:[CD]\d{1,5}\s*[,;]?\s*)+\]/g, '');

/* ── report fact sheets ──────────────────────────────────────────────── */

/** One fill per profile at a time. */
const filling = new Map();
/** Fact sheets written per fill, so a profile with many old reports catches up over a few visits. */
const MAX_FILL = 30;

/**
 * Writes the missing fact sheets of a profile's reports — those read before
 * fact sheets existed, or whose sheet failed. Runs in the background.
 */
export function fillKnowledge(owner) {
  const id = String(owner.profile);
  if (!filling.has(id)) {
    filling.set(id, fill(owner)
      .catch((err) => console.error(`[checkin] ${id}: fact sheets not written:`, err.message))
      .finally(() => filling.delete(id)));
  }
  return filling.get(id);
}

async function fill(owner) {
  const uploads = await Report.find({ ...owner, status: 'ready' }, { 'documents.n': 1, 'documents.status': 1, 'documents.summary': 1, 'documents.knowledge': 1 }).lean();
  const todo = uploads
    .map((u) => ({ id: u._id, ns: (u.documents ?? []).filter((d) => readable(d) && !d.knowledge).map((d) => d.n) }))
    .filter((u) => u.ns.length);
  let written = 0;
  for (const { id, ns } of todo) {
    if (written >= MAX_FILL) break;
    const report = await Report.findById(id, { title: 1, chunks: 1, markdown: 1, source: 1, documents: 1 }).lean();
    for (const n of ns) {
      if (written >= MAX_FILL) break;
      const doc = report?.documents?.find((d) => d.n === n);
      if (!doc) continue;
      const knowledge = await documentKnowledge(report, doc).catch(() => '');
      written += 1;
      if (knowledge) await Report.updateOne({ _id: id, 'documents.n': n }, { $set: { 'documents.$.knowledge': knowledge } });
    }
  }
  if (written) console.log(`[checkin] ${owner.profile}: ${written} fact sheets written`);
  return written;
}

/**
 * Each report's fact sheet, newest first (a summary's key lines stand in
 * until the sheet is written) → { text, treatment }. `treatment` is whether
 * the reports show one: a prescription, a discharge summary, or medicines.
 */
async function reportFacts(owner) {
  const uploads = await Report.find(owner, { title: 1, createdAt: 1, documents: 1 }).lean();
  const docs = uploads
    .flatMap((upload) => (upload.documents ?? []).filter(readable).map((doc) => ({ upload, doc })))
    .sort((a, b) =>
      (b.doc.dateISO || '').localeCompare(a.doc.dateISO || '') ||
      new Date(b.upload.createdAt) - new Date(a.upload.createdAt));

  const treatment = docs.some(({ doc }) => ['prescription', 'discharge'].includes(doc.category) || /^Medicines:/m.test(doc.knowledge ?? ''));
  let out = '';
  for (const { upload, doc } of docs) {
    let block = doc.knowledge?.trim();
    if (!block) {
      const flagged = (doc.values ?? []).filter((v) => FLAGGED.has(v.flag)).map((v) => `${v.name} ${v.value}${v.unit ? ` ${v.unit}` : ''} (${v.flag})`);
      const inShort = withoutCitations(doc.summary).replace(/^#+.*$/gm, '').trim().split('\n').find(Boolean) ?? '';
      block = [
        `Report: ${doc.title || REPORT_TYPE_LABEL[doc.category] || upload.title}, ${doc.date || 'no date printed'}`,
        inShort && `In short: ${inShort.slice(0, 300)}`,
        flagged.length && `Out of range: ${flagged.join('; ')}`,
      ].filter(Boolean).join('\n');
    }
    if (out.length + block.length > MAX_FACTS_CHARS) {
      out += '[Older reports were left out to fit.]\n';
      break;
    }
    out += `${block}\n\n`;
  }
  return { text: out.trim(), treatment };
}

/* ── the voice chat ──────────────────────────────────────────────────── */

/**
 * The name to greet with: the first word, without initials or dots —
 * "Palaniappan.V" and "V. Palaniappan" are both "Palaniappan".
 */
export function firstName(profile) {
  const words = String(profile.name ?? '')
    .replace(/[.,_]+/g, ' ')
    .split(/\s+/)
    // An initial: one Latin letter, or one letter of another script ("வி" is 2 characters).
    .filter((w) => w.length > (/^[\x00-\x7F]+$/.test(w) ? 1 : 2));
  return words[0] || 'there';
}

function ageOf(dateOfBirth) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth ?? '')) return '';
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = dayOf().split('-').map(Number);
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return age >= 0 && age < 130 ? String(age) : '';
}

/** The last few days' notes, newest first, so the chat can ask how things are now. */
async function recentNotes(profileId) {
  const recent = await CheckIn.find({ profile: profileId, noted: true }, { day: 1, feeling: 1, points: 1 })
    .sort({ day: -1 }).limit(RECENT_CHECKINS).lean();
  const today = dayOf();
  return recent
    .filter((c) => c.points?.length)
    .map((c) => `${c.day === today ? 'Earlier today' : shortDay(c.day)}${c.feeling ? ` (felt ${c.feeling})` : ''}: ${c.points.join('; ')}`)
    .join('\n');
}

/** → { instructions, greeting } for a GPT-Live check-in session. */
export async function checkinSession(profile, owner, language) {
  const code = languageOf(language);
  const [{ text: facts, treatment }, recent] = await Promise.all([reportFacts(owner), recentNotes(profile._id)]);
  // What the reports allow it to ask about: nothing known means no condition or treatment questions.
  const scope = !facts
    ? 'This person has no reports in MediThink yet, so you know of no condition and no treatment. Do not ask about treatment, medicines or any condition. Only ask how they are, follow what they tell you, and note it.'
    : treatment
      ? 'Their reports show a treatment, so you may ask in general how it is going.'
      : 'Their reports show no prescription or treatment, so do not ask how a treatment is going. Ask only about the topics from their reports.';
  const age = ageOf(profile.dateOfBirth);
  const person = [
    `- First name: ${firstName(profile)}`,
    age && `- Age: ${age}`,
    profile.sex && `- Sex: ${profile.sex}`,
    `- Today is ${longDate()}.`,
  ].filter(Boolean).join('\n');

  const instructions = [
    CHECKIN_PROMPT,
    // Unlike the Assistant, a check-in follows how the person talks, mixing languages if they do.
    code === 'en'
      ? 'Speak English. If they speak another language, answer in it.'
      : `Speak ${LANGUAGES[code].name} by default, in simple everyday ${LANGUAGES[code].name}. If they mix in English words or sentences, mix the same way, as people naturally do; if they switch fully to English, you may too.`,
    `About the person:\n${person}`,
    `Their recent check-ins, newest first:\n${recent || 'None yet — this is their first check-in.'}`,
    `What their reports say, newest first. This is background for you, not something to read out:\n${facts || 'No reports yet.'}`,
    scope,
  ].join('\n\n');

  // Said first, as soon as the session starts (the browser sends it), so the person does not have to.
  const again = await CheckIn.exists({ profile: profile._id, day: dayOf() });
  const name = firstName(profile);
  // The very first check-in says once what it is for, so the questions do not feel nosy.
  const first = !again && !(await CheckIn.exists({ profile: profile._id }));
  const greeting = again
    ? `Hi again, ${name}! Has anything changed since we talked earlier today?`
    : first
      ? `Hi ${name}! This is your daily check-in — a quick chat each day, and I'll note how you are so you can tell your doctor later. So, how has your day been?`
      : `Hi ${name}! How has your day been? Is everything okay?`;
  return { instructions: `${instructions}\n\nThe app will hand you your opening line to say first. Say it in ${LANGUAGES[code].name}, warmly and naturally.`, greeting };
}

/* ── the notes ───────────────────────────────────────────────────────── */

const cleanList = (list, max, len) => (Array.isArray(list) ? list : [])
  .map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, len))
  .filter(Boolean)
  .slice(0, max);

/** Writes a check-in's notes from all it holds. Returns the fields to store. */
export async function writeNotes(checkin) {
  const said = checkin.turns.filter((t) => t.role === 'user' && t.content.trim());
  if (!said.length) return { feeling: '', points: [], tellDoctor: [], noted: true };

  let transcript = checkin.turns.map((t) => `${t.role === 'user' ? 'Person' : 'Assistant'}: ${t.content}`).join('\n');
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS);
  const code = languageOf(checkin.language);
  const inLanguage = code === 'en'
    ? 'Write "points" and "tellDoctor" in English.'
    : `Write "points" and "tellDoctor" in simple ${LANGUAGES[code].name} (${LANGUAGES[code].native}); keep "feeling" as one of the English words given.`;

  const reply = await complete(
    [
      { role: 'system', content: CHECKIN_NOTES_PROMPT },
      { role: 'system', content: inLanguage },
      { role: 'user', content: `Transcript:\n${transcript}` },
    ],
    { json: true },
  );
  const parsed = JSON.parse(reply);
  return {
    feeling: FEELINGS.has(parsed?.feeling) ? parsed.feeling : '',
    points: cleanList(parsed?.points, 8, 160),
    tellDoctor: cleanList(parsed?.tellDoctor, 3, 140),
    noted: true,
  };
}

/** Writes and stores a check-in's notes; on failure it is kept un-noted, to try again later. */
export async function noteCheckin(checkin) {
  try {
    Object.assign(checkin, await writeNotes(checkin));
  } catch (err) {
    console.error(`[checkin] ${checkin._id}: notes not written:`, err.message);
    checkin.noted = false;
  }
  await checkin.save();
  return checkin;
}

/* ── the doctor-visit note ───────────────────────────────────────────── */

/** Recent notes keyed by what they were built from; small, and lost on restart (it is cheap to rebuild). */
const doctorNotes = new Map();
const MAX_CACHED = 200;

/** The check-ins of the last `days` days, gathered into a short note for the doctor. */
export async function doctorNote(profileId, days) {
  const from = dayOf(new Date(Date.now() - (days - 1) * 86_400_000));
  const checkins = await CheckIn.find({ profile: profileId, day: { $gte: from }, noted: true }, { day: 1, feeling: 1, points: 1, tellDoctor: 1, updatedAt: 1 })
    .sort({ day: -1 }).lean();
  const withNotes = checkins.filter((c) => c.points?.length);
  const feelings = { good: 0, okay: 0, unwell: 0 };
  for (const c of withNotes) if (FEELINGS.has(c.feeling)) feelings[c.feeling] += 1;
  const base = { days, from, count: withNotes.length, feelings };
  if (!withNotes.length) return { ...base, summary: '', items: [] };

  const key = crypto.createHash('sha1').update(`${profileId}|${days}|${withNotes.map((c) => `${c._id}:${new Date(c.updatedAt).getTime()}`).join('|')}`).digest('hex');
  if (doctorNotes.has(key)) return { ...base, ...doctorNotes.get(key) };

  const notes = withNotes
    .map((c) => `${shortDay(c.day)}${c.feeling ? ` — felt ${c.feeling}` : ''}\n${c.points.map((p) => `- ${p}`).join('\n')}${c.tellDoctor?.length ? `\nTo raise: ${c.tellDoctor.join('; ')}` : ''}`)
    .join('\n\n');
  const reply = JSON.parse(await complete(
    [{ role: 'system', content: DOCTOR_NOTE_PROMPT }, { role: 'user', content: notes }],
    { json: true },
  ));
  const note = {
    summary: String(reply?.summary ?? '').trim().slice(0, 300),
    items: (Array.isArray(reply?.items) ? reply.items : [])
      .map((i) => ({ text: String(i?.text ?? '').trim().slice(0, 140), dates: String(i?.dates ?? '').trim().slice(0, 60) }))
      .filter((i) => i.text)
      .slice(0, 6),
  };
  if (doctorNotes.size >= MAX_CACHED) doctorNotes.delete(doctorNotes.keys().next().value);
  doctorNotes.set(key, note);
  return { ...base, ...note };
}
