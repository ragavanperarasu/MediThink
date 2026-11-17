import crypto from 'node:crypto';
import Profile from '../models/Profile.js';
import Report from '../models/Report.js';
import { complete } from './analyse.js';
import { FOOD_NOTE, HEALTH_CARD_PROMPT } from './prompts.js';
import { REPORT_TYPE_LABEL } from './reportTypes.js';

/*
 * The home page's health card for one profile: main concerns, allergies,
 * current medicines and blood group, read by the model from every report's
 * text; and the latest out-of-range results, picked in code from the values
 * already read. Every item carries the id (D1, D2, …) of the report it came
 * from, and a model item whose words are not in that report is dropped.
 *
 * Built once per set of reports and kept on the profile; a new, changed or
 * deleted report changes the key, and the next visit builds it again.
 */

/** Bump when the prompt or the card's shape changes, so stored cards are rebuilt. */
const VERSION = 'v4';
/** Text handed over per report, and in all. */
const MAX_DOC_CHARS = 10_000;
const MAX_TOTAL_CHARS = 120_000;
const MAX_ATTENTION = 5;
const FLAGGED = new Set(['high', 'low', 'abnormal']);

/** One build per profile at a time; a second visit waits for the first. */
const building = new Map();

const readable = (doc) => doc && doc.status !== 'failed' && Boolean(doc.summary);

/** Every readable document of the profile, newest first, labelled D1, D2, … */
async function loadSources(owner) {
  const uploads = await Report.find(owner, {
    title: 1, createdAt: 1, analysedAt: 1, documents: 1, 'chunks.page': 1, 'chunks.text': 1,
  }).lean();
  return uploads
    .flatMap((upload) => (upload.documents ?? []).filter(readable).map((doc) => ({ upload, doc })))
    .sort((a, b) =>
      (b.doc.dateISO || '').localeCompare(a.doc.dateISO || '') ||
      new Date(b.upload.createdAt) - new Date(a.upload.createdAt))
    .map((s, i) => ({ ...s, ref: `D${i + 1}` }));
}

const cardKey = (sources) =>
  crypto
    .createHash('sha1')
    .update([VERSION, ...sources.map(({ upload, doc }) => `${upload._id}:${doc.n}:${new Date(upload.analysedAt ?? 0).getTime()}`)].join('|'))
    .digest('hex');

/** A document's own page text, lowercased once for the checks below. */
function documentText({ upload, doc }) {
  const pages = new Set(doc.pages ?? []);
  return (upload.chunks ?? [])
    .filter((c) => pages.has(c.page))
    .map((c) => c.text ?? '')
    .join('\n')
    .slice(0, MAX_DOC_CHARS);
}

function sourcesForModel(sources, texts) {
  let out = '';
  for (const s of sources) {
    const heading = [s.doc.title || s.upload.title, REPORT_TYPE_LABEL[s.doc.category] ?? 'Report', s.doc.date || 'no date printed'].join(' · ');
    const block = `=== ${s.ref}: ${heading} ===\n${texts.get(s.ref)}\n\n`;
    if (out.length + block.length > MAX_TOTAL_CHARS) {
      out += '[Older reports were left out to fit.]\n';
      break;
    }
    out += block;
  }
  return out;
}

const words = (text) => (String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 4);

/**
 * Whether an item's words are in its report. "High blood pressure
 * (hypertension)" passes on either half: the plain words or the printed term.
 */
function printedIn(text, docText) {
  const inner = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const outer = text.replace(/\([^)]*\)/g, ' ');
  return [outer, ...inner].some((part) => {
    const ws = words(part);
    if (!ws.length) return part.trim().length > 0 && docText.includes(part.trim().toLowerCase());
    return ws.filter((w) => docText.includes(w)).length >= Math.ceil(ws.length / 2);
  });
}

const BLOOD_GROUP = /^(AB|A|B|O)\s*(\+|-|−|positive|negative|pos|neg|\+ve|-ve)$/i;

/** The model's reply, checked item by item against the reports it cites. */
function cleanReply(reply, lowerTexts, flaggedRefs) {
  const items = (list, max) => {
    const seen = new Set();
    return (Array.isArray(list) ? list : [])
      .map((item) => ({ text: String(item?.text ?? '').trim().slice(0, 80), ref: String(item?.source ?? '').trim() }))
      .filter(({ text, ref }) => {
        const docText = lowerTexts.get(ref);
        const id = text.toLowerCase();
        if (!text || !docText || seen.has(id) || !printedIn(text, docText)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, max);
  };

  const allergies = items(reply?.allergies, 6);
  const noRef = String(reply?.noAllergies ?? '').trim();
  const noAllergies = !allergies.length && lowerTexts.has(noRef) && /allerg|nkda/.test(lowerTexts.get(noRef)) ? noRef : '';

  const group = String(reply?.bloodGroup?.text ?? '').trim();
  const groupRef = String(reply?.bloodGroup?.source ?? '').trim();
  const bloodGroup =
    BLOOD_GROUP.test(group) && /blood\s*group|abo|\brh\b/.test(lowerTexts.get(groupRef) ?? '')
      ? { text: group, ref: groupRef }
      : null;

  return {
    concerns: items(reply?.concerns, 5),
    allergies,
    noAllergies,
    medicines: items(reply?.medicines, 6),
    bloodGroup,
    foods: cleanFoods(reply?.foods, flaggedRefs),
  };
}

/** Anything that reads as a medicine is not a food idea, whatever the model meant. */
const NOT_FOOD = /tablet|capsule|supplement|tonic|syrup|injection|drops|powder|sachet|\b\d+\s*(mg|mcg|iu|ml)\b|dose|ayurved|herbal|homeo|medicine/i;

/**
 * Food ideas, kept only when they are for one of the latest out-of-range
 * results (`flaggedRefs` — the reports those results are in).
 */
function cleanFoods(list, flaggedRefs) {
  const words = (xs, max) => (Array.isArray(xs) ? xs : [])
    .map((x) => String(x ?? '').trim().slice(0, 40))
    .filter((x) => x && !NOT_FOOD.test(x))
    .slice(0, max);
  return (Array.isArray(list) ? list : [])
    .map((f) => ({
      for: String(f?.for ?? '').trim().slice(0, 60),
      ref: String(f?.source ?? '').trim(),
      eat: words(f?.eat, 5),
      less: words(f?.less, 3),
    }))
    .filter((f) => f.for && flaggedRefs.has(f.ref) && f.eat.length && !NOT_FOOD.test(f.for))
    .slice(0, 3);
}

const testKey = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The newest reading of each test, kept when it is out of range. */
function latestFlagged(sources) {
  const seen = new Set();
  const out = [];
  for (const { ref, doc } of sources) {
    for (const v of doc.values ?? []) {
      // "Fasting" under urine sugar is not "Fasting" glucose: the section is part of the test.
      const name = testKey(v.name);
      const key = `${testKey(v.section)}/${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      if (FLAGGED.has(v.flag)) {
        out.push({ name: v.name, section: v.section || '', value: v.value, unit: v.unit || '', flag: v.flag, date: doc.date || '', ref });
      }
    }
  }
  return out;
}

async function build(profile, owner, sources, key) {
  const texts = new Map(sources.map((s) => [s.ref, documentText(s)]));
  const lowerTexts = new Map([...texts].map(([ref, t]) => [ref, t.toLowerCase()]));

  // Every latest out-of-range result: the card shows the first few, food ideas may use any.
  const flagged = latestFlagged(sources);
  const flaggedList = flagged.length
    ? flagged.map((v) => `- ${v.section ? `${v.section} › ` : ''}${v.name}: ${v.value}${v.unit ? ` ${v.unit}` : ''} — ${v.flag} [${v.ref}]`).join('\n')
    : 'None.';

  let read = { concerns: [], allergies: [], noAllergies: '', medicines: [], bloodGroup: null, foods: [] };
  let readOk = true;
  try {
    const reply = await complete(
      [
        { role: 'system', content: HEALTH_CARD_PROMPT },
        { role: 'user', content: `${sourcesForModel(sources, texts)}\nLatest out-of-range results:\n${flaggedList}` },
      ],
      { json: true },
    );
    read = cleanReply(JSON.parse(reply), lowerTexts, new Set(flagged.map((v) => v.ref)));
  } catch (err) {
    console.error(`[health-card] ${profile._id}: not read:`, err.message);
    readOk = false;
  }

  const card = {
    ...read,
    attention: flagged.slice(0, MAX_ATTENTION),
    // Shown under the food ideas, as on the Summary tab.
    foodNote: read.foods.length ? FOOD_NOTE.replace(/^_|_$/g, '') : '',
    lastCheck: sources[0] ? { date: sources[0].doc.date || '', ref: sources[0].ref } : null,
    reportCount: sources.length,
  };
  const used = new Set(
    [...card.concerns, ...card.allergies, ...card.medicines, ...card.attention, ...card.foods, card.bloodGroup, card.lastCheck]
      .filter(Boolean)
      .map((item) => item.ref)
      .concat(card.noAllergies || []),
  );
  const payload = {
    card,
    complete: readOk,
    builtAt: new Date(),
    sources: sources
      .filter((s) => used.has(s.ref))
      .map(({ ref, upload, doc }) => ({
        ref,
        reportId: String(upload._id),
        n: doc.n,
        several: upload.documents.length > 1,
        title: doc.title || REPORT_TYPE_LABEL[doc.category] || upload.title,
        date: doc.date || '',
        category: doc.category,
      })),
  };

  // A card the model could not read is shown but not kept, so the next visit tries again.
  if (readOk) {
    await Profile.updateOne({ _id: profile._id }, { $set: { healthCard: { key, builtAt: payload.builtAt, card: payload } } });
  }
  return payload;
}

/** The profile's health card, from the stored one when its reports have not changed. */
export async function healthCardFor(profile, owner) {
  const sources = await loadSources(owner);
  if (!sources.length) return { card: null, sources: [], complete: true, builtAt: null };

  const key = cardKey(sources);
  const stored = await Profile.findById(profile._id, { healthCard: 1 }).lean();
  if (stored?.healthCard?.key === key && stored.healthCard.card) return stored.healthCard.card;

  const id = `${profile._id}:${key}`;
  if (!building.has(id)) {
    building.set(id, build(profile, owner, sources, key).finally(() => building.delete(id)));
  }
  return building.get(id);
}
