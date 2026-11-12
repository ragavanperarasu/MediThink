import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import { env } from '../env.js';
import Report from '../models/Report.js';
import AdeParse from '../models/AdeParse.js';
import { documentForModel, locateValue, readAdeDocument } from './ade.js';
import { LandingError, parseWithLandingAI } from './landing.js';
import { splitPdf } from './pdf.js';
import {
  buildComparison, checkPairs, comparableGroups, comparisonText, leftovers, narrativeIsFaithful,
} from './compare.js';
import { ANALYSIS_PROMPT, CHANGES_PROMPT, MATCH_PROMPT, SUMMARY_PROMPT } from './prompts.js';
import { REPORT_TYPE_CONTEXT, REPORT_TYPE_LABEL } from './reportTypes.js';
import { cleanSplit, pagesForSplitter, singleDocument, splitterPrompt } from './split.js';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

const NO_KEY = 'OPENAI_API_KEY is not set in server/.env, so MediThink cannot read reports yet. Add it and restart the server.';

const FLAGS = new Set(['low', 'high', 'abnormal', 'normal', 'unknown']);
const OUT_OF_RANGE = new Set(['low', 'high', 'abnormal']);

/** Documents analysed at once. Each is two model calls. */
const DOCUMENT_CONCURRENCY = 3;

const text = (value, max = 400) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** One model call. No temperature: the reasoning models reject it. */
export async function complete(messages, { json = false } = {}) {
  if (!openai) throw new Error(NO_KEY);
  const completion = await openai.chat.completions.create(
    {
      model: env.ANALYSIS_MODEL,
      messages,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
    { timeout: env.ANALYSIS_TIMEOUT_MS },
  );
  return (completion.choices[0]?.message?.content ?? '').trim();
}

/**
 * One model call, streamed: `onDelta` gets each piece of the answer as it is
 * written, so it can be shown while it types. Returns the whole answer.
 */
export async function completeStream(messages, onDelta, { signal } = {}) {
  if (!openai) throw new Error(NO_KEY);
  const stream = await openai.chat.completions.create(
    { model: env.ANALYSIS_MODEL, messages, stream: true },
    { timeout: env.ANALYSIS_TIMEOUT_MS, signal },
  );
  let text = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      text += delta;
      onDelta(delta);
    }
  }
  return text.trim();
}

const pageList = (pages) => pages.map((p) => p + 1).join(', ');

/** One document as the model is handed it, with what kind of document it is. */
function framedDocument(report, doc, chunks) {
  const whole = doc.pages.length === (report.source?.pageCount ?? doc.pages.length);
  const where = whole ? '' : ` It is page${doc.pages.length > 1 ? 's' : ''} ${pageList(doc.pages)} of a larger upload; only this document is given.`;
  return `${REPORT_TYPE_CONTEXT[doc.category] ?? REPORT_TYPE_CONTEXT.other}${where}\n\nReport:\n\n---\n${documentForModel(report, chunks)}\n---`;
}

/**
 * Checks one model-returned row before it is stored. Every field is
 * re-checked rather than trusted: a bad flag would render as a colour that
 * states a clinical fact, so an unrecognised one becomes "unknown".
 */
function cleanValue(raw, report, chunks) {
  if (!raw || typeof raw !== 'object') return null;
  const name = text(raw.name, 200);
  const value = text(raw.value, 120);
  if (!name || !value) return null;

  const flag = text(raw.flag).toLowerCase();
  const row = {
    name,
    value,
    unit: text(raw.unit, 60),
    range: text(raw.range, 160),
    flag: FLAGS.has(flag) ? flag : 'unknown',
    section: text(raw.section, 160),
  };

  const found = locateValue(report, { ...row, source: raw.source }, chunks);
  return {
    ...row,
    source: found.chunk?.ref ?? '',
    page: found.chunk?.page ?? null,
    box: found.box,
    verified: found.verified,
  };
}

/* ── layer 1: split ──────────────────────────────────────────────────── */

/**
 * Which pages make up which document, read from the JSON's text alone. A
 * split that cannot be parsed falls back to the whole upload as one
 * document, so a bad split costs the separation, never the analysis.
 */
async function splitDocuments(report) {
  const pageCount = Math.max(1, report.source?.pageCount ?? 1);
  if (pageCount === 1) return singleDocument(1);

  const reply = await complete(
    [
      { role: 'system', content: splitterPrompt() },
      { role: 'user', content: pagesForSplitter(report) },
    ],
    { json: true },
  );
  try {
    const docs = cleanSplit(JSON.parse(reply), pageCount);
    if (docs) return docs;
  } catch (err) {
    console.error(`[split] ${report._id}: unparseable split:`, err.message);
  }
  return singleDocument(pageCount);
}

/* ── layer 2: each document ──────────────────────────────────────────── */

/** Values and details in one call, the summary in another, run together. */
async function analyseDocument(report, doc) {
  const chunks = report.chunks.filter((c) => doc.pages.includes(c.page));
  if (!chunks.length) {
    return { status: 'ready', summary: '### In short\n\nThese pages carry no readable text, so there is nothing to summarise.', values: [], valueCount: 0, flaggedCount: 0 };
  }

  const document = framedDocument(report, doc, chunks);
  const [analysisText, summary] = await Promise.all([
    complete([{ role: 'system', content: ANALYSIS_PROMPT }, { role: 'user', content: document }], { json: true }),
    complete([{ role: 'system', content: SUMMARY_PROMPT }, { role: 'user', content: document }]),
  ]);
  if (!summary) throw new Error('The model returned an empty summary.');

  let parsed = {};
  try {
    parsed = JSON.parse(analysisText);
  } catch (err) {
    // A malformed values payload must not cost the summary too.
    console.error(`[analyse] ${report._id} document ${doc.n}: values JSON unparseable:`, err.message);
  }

  const details = parsed?.details && typeof parsed.details === 'object' ? parsed.details : {};
  const values = (Array.isArray(parsed?.values) ? parsed.values : [])
    .map((raw) => cleanValue(raw, report, chunks))
    .filter(Boolean);

  return {
    status: 'ready',
    error: '',
    summary,
    values,
    valueCount: values.length,
    flaggedCount: values.filter((v) => OUT_OF_RANGE.has(v.flag)).length,
    title: doc.title || text(details.title, 160),
    date: doc.date || text(details.reportDate, 80),
    facility: doc.facility || text(details.facility, 200),
    patient: { name: text(details.patientName, 160), age: text(details.age, 40), sex: text(details.sex, 40) },
    referredBy: text(details.referredBy, 160),
  };
}

/** Runs `task` over `items`, at most `limit` at a time. */
async function pool(items, limit, task) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      await task(items[index], index);
    }
  });
  await Promise.all(workers);
}

/* ── layer 3: changes over time ──────────────────────────────────────── */

const labelOf = (category) => REPORT_TYPE_LABEL[category] ?? category;

/**
 * Documents of the same kind, compared. Code lines tests up by name and
 * computes every difference; the model is asked only to pair names code
 * could not, and to put the computed table into words. Either model step
 * failing leaves the table as code built it — never a wrong table.
 */
async function compareDocuments(reportId, docs) {
  const comparisons = [];
  for (const group of comparableGroups(docs)) {
    const { byId, text: unmatched } = leftovers(group);
    let pairs = [];
    const fromDocs = new Set([...byId.values()].map((x) => x.doc.n));
    if (fromDocs.size > 1) {
      try {
        const reply = await complete(
          [{ role: 'system', content: MATCH_PROMPT }, { role: 'user', content: unmatched }],
          { json: true },
        );
        pairs = checkPairs(JSON.parse(reply), byId);
      } catch (err) {
        console.error(`[compare] ${reportId} ${group.category}: name matching skipped:`, err.message);
      }
    }

    const comparison = buildComparison(group, pairs);
    if (comparison.rows.some((r) => r.cells.filter(Boolean).length > 1)) {
      const table = comparisonText(comparison, labelOf);
      try {
        const narrative = await complete([
          { role: 'system', content: CHANGES_PROMPT },
          { role: 'user', content: table },
        ]);
        const check = narrativeIsFaithful(narrative, table);
        if (check.ok) comparison.narrative = narrative;
        else console.warn(`[compare] ${reportId} ${group.category}: explanation dropped, figures not in the table: ${check.strays.join(', ')}`);
      } catch (err) {
        console.error(`[compare] ${reportId} ${group.category}: explanation skipped:`, err.message);
      }
    }
    comparisons.push(comparison);
    console.log(`[compare] ${reportId} ${group.category}: ${comparison.rows.length} tests, ${pairs.length} matched by meaning`);
  }
  return comparisons;
}

/** What the library shows for the upload as a whole, from its documents. */
function rollUp(report, docs) {
  const ready = docs.filter((d) => d.status === 'ready');
  const unique = (list) => [...new Set(list.filter(Boolean))];
  // One printed date per calendar day ("04.11.2026" and "04/11/2026" are the
  // same day), oldest first, so a range reads from → to.
  // A date that could not be read as a day is left out of the range.
  const byDay = new Map();
  for (const d of ready.filter((x) => x.date && x.dateISO).sort((a, b) => a.dateISO.localeCompare(b.dateISO))) {
    if (!byDay.has(d.dateISO)) byDay.set(d.dateISO, d.date);
  }
  const datesShown = byDay.size ? [...byDay.values()] : unique(ready.map((d) => d.date)).slice(0, 1);
  const patient = ready.find((d) => d.patient?.name)?.patient ?? { name: '', age: '', sex: '' };
  const types = unique(docs.map((d) => d.category));

  const update = {
    documentTypes: types,
    reportType: types.length === 1 ? types[0] : 'other',
    valueCount: ready.reduce((sum, d) => sum + d.valueCount, 0),
    flaggedCount: ready.reduce((sum, d) => sum + d.flaggedCount, 0),
    patient,
    reportDate: datesShown.length > 1 ? `${datesShown[0]} – ${datesShown.at(-1)}` : datesShown[0] ?? '',
    facility: unique(ready.map((d) => d.facility)).join(' · ').slice(0, 200),
    referredBy: ready.find((d) => d.referredBy)?.referredBy ?? '',
  };

  // One document is named by its own title; an upload of several is a
  // folder, named after the file it came in — each document keeps its title.
  if (report.titleSource !== 'user') {
    const fileName = (report.source?.pdfFilename || report.source?.jsonFilename || '')
      .replace(/\.(pdf|json)$/i, '')
      .replace(/-annotated$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    if (docs.length > 1 && fileName) {
      update.title = fileName.slice(0, 160);
      update.titleSource = 'file';
    } else if (docs.length === 1 && docs[0].title) {
      update.title = docs[0].title.slice(0, 160);
      update.titleSource = 'detected';
    }
  }
  return update;
}

/** A Mongo document stops at 16 MB; the raw ADE JSON is kept below this. */
const MAX_RAW_BYTES = 15 * 1024 * 1024;
/** The text and chunks stored on the report itself. */
const MAX_STORED_BYTES = 12 * 1024 * 1024;

/**
 * Step 0 for a PDF uploaded on its own: LandingAI ADE reads it. The full
 * response is kept as it came — in MongoDB (AdeParse) and as source.json
 * beside the PDF — and the report gets the text and chunks read from it.
 * Returns the report as it now stands.
 */
async function extractWithLandingAI(report, dir) {
  await Report.updateOne({ _id: report._id }, { $set: { progress: { stage: 'extracting', done: 0, total: 100 } } });

  const pdf = await fs.readFile(path.join(dir, 'source.pdf'));
  let lastShown = -1;
  const { jobId, result } = await parseWithLandingAI(pdf, report.source?.pdfFilename, {
    onProgress: (fraction) => {
      const done = Math.round(fraction * 100);
      if (done === lastShown) return;
      lastShown = done;
      Report.updateOne({ _id: report._id }, { $set: { 'progress.done': done } }).catch(() => {});
    },
  });

  const json = JSON.stringify(result);
  await fs.writeFile(path.join(dir, 'source.json'), json);

  // Keep the raw response in MongoDB too; drop only the per-cell grounding
  // map if the whole thing would not fit in one document.
  let stored = result;
  let trimmed = false;
  if (Buffer.byteLength(json) > MAX_RAW_BYTES) {
    const { grounding: _grounding, ...rest } = result;
    stored = rest;
    trimmed = true;
  }
  const meta = result.metadata ?? {};
  await AdeParse.findOneAndUpdate(
    { report: report._id },
    {
      $set: {
        account: report.account,
        profile: report.profile,
        jobId,
        model: env.LANDINGAI_MODEL,
        pageCount: Number(meta.page_count) || 0,
        creditUsage: typeof meta.credit_usage === 'number' ? meta.credit_usage : null,
        durationMs: typeof meta.duration_ms === 'number' ? meta.duration_ms : null,
        failedPages: Array.isArray(meta.failed_pages) ? meta.failed_pages : [],
        trimmed,
        response: stored,
      },
    },
    { upsert: true },
  );

  const ade = readAdeDocument(result);
  if (Buffer.byteLength(ade.markdown) + Buffer.byteLength(JSON.stringify(ade.chunks)) > MAX_STORED_BYTES) {
    throw new LandingError('This PDF is too large to analyse as one report. Split it and upload the parts.');
  }
  const base = (report.source?.pdfFilename || 'report.pdf').replace(/\.pdf$/i, '');
  const update = {
    markdown: ade.markdown,
    chunks: ade.chunks,
    'source.pageCount': ade.pageCount || report.source?.pageCount || 1,
    'source.jsonFilename': `${base}.ade.json`,
    'source.jsonBytes': Buffer.byteLength(json),
    'source.adeJobId': jobId,
    'source.adeModel': env.LANDINGAI_MODEL,
    'progress.done': 100,
  };
  await Report.updateOne({ _id: report._id }, { $set: update });
  console.log(`[ade] ${report._id}: ${ade.chunks.length} chunks over ${ade.pageCount} page(s), ${meta.credit_usage ?? '?'} credits (job ${jobId})`);
  return Report.findById(report._id).lean();
}

/**
 * Reads an upload: split it into documents, cut the PDF to match, then read
 * each document on its own. Always ends with the report marked ready or
 * failed — never left "analysing".
 */
async function runAnalysis(reportId) {
  let report = await Report.findById(reportId).lean();
  if (!report) return;
  const dir = path.join(env.STORAGE_DIR, String(reportId));

  try {
    // A PDF uploaded alone is read by LandingAI first — once. A re-analysis
    // reuses what was read and is not charged again.
    if (!report.chunks?.length && !report.markdown) {
      report = await extractWithLandingAI(report, dir);
    }

    await Report.updateOne({ _id: reportId }, { $set: { progress: { stage: 'splitting', done: 0, total: 0 } } });
    const split = await splitDocuments(report);

    const written = report.source?.hasPdf ? await splitPdf(dir, split) : new Set();
    const docs = split.map((doc) => ({
      ...doc,
      patient: { name: '', age: '', sex: '' },
      referredBy: '',
      hasPdf: written.has(doc.n),
      status: 'analysing',
      error: '',
      summary: '',
      values: [],
      valueCount: 0,
      flaggedCount: 0,
    }));

    // The split is stored before any document is read, so the page can
    // already show what was found while the reading carries on.
    await Report.updateOne(
      { _id: reportId },
      {
        $set: {
          documents: docs,
          documentTypes: [...new Set(docs.map((d) => d.category))],
          progress: { stage: 'analysing', done: 0, total: docs.length },
          // Pre-split fields are retired once an upload has documents.
          summary: '',
          values: [],
          comparisons: [],
        },
      },
    );
    console.log(`[split] ${reportId}: ${docs.map((d) => `${d.n}.${d.category}[${pageList(d.pages)}]${d.date ? ` ${d.date}` : ''}`).join('  ')}`);

    await pool(docs, DOCUMENT_CONCURRENCY, async (doc, index) => {
      try {
        Object.assign(doc, await analyseDocument(report, doc));
      } catch (err) {
        if (err?.message === NO_KEY) throw err;
        console.error(`[analyse] ${reportId} document ${doc.n} failed:`, err);
        Object.assign(doc, { status: 'failed', error: `This document could not be read: ${err?.message || 'unknown error'}`.slice(0, 600) });
      }
      await Report.updateOne(
        { _id: reportId },
        { $set: { [`documents.${index}`]: doc }, $inc: { 'progress.done': 1 } },
      );
    });

    const ready = docs.filter((d) => d.status === 'ready');
    if (!ready.length) throw new Error(docs[0]?.error || 'No document could be read.');

    await Report.updateOne({ _id: reportId }, { $set: { 'progress.stage': 'comparing' } });
    const comparisons = await compareDocuments(reportId, docs);

    const update = {
      ...rollUp(report, docs),
      documents: docs,
      comparisons,
      status: 'ready',
      error: '',
      analysedAt: new Date(),
      model: env.ANALYSIS_MODEL,
      progress: { stage: '', done: docs.length, total: docs.length },
    };
    await Report.updateOne({ _id: reportId }, { $set: update });
    console.log(`[analyse] ${reportId}: ${docs.length} documents, ${update.valueCount} values, ${update.flaggedCount} flagged (${env.ANALYSIS_MODEL})`);
  } catch (err) {
    console.error(`[analyse] ${reportId} failed:`, err);
    const message =
      err?.message === NO_KEY || err instanceof LandingError
        ? err.message
        : err?.status === 422
          ? err.message
          : `The analysis did not finish: ${err?.message || 'unknown error'}`;
    await Report.updateOne(
      { _id: reportId },
      { $set: { status: 'failed', error: message.slice(0, 600), 'progress.stage': '' } },
    );
  }
}

/**
 * Starts an analysis in the background, unless one is already running.
 * Returns false when it was already running. The status flip is atomic, so
 * two presses of the button cannot start two paid runs.
 */
export async function startAnalysis(reportId) {
  const claimed = await Report.findOneAndUpdate(
    { _id: reportId, status: { $ne: 'analysing' } },
    { $set: { status: 'analysing', error: '' } },
  );
  if (!claimed) return false;
  runAnalysis(reportId).catch((err) => console.error('[analyse] unexpected:', err));
  return true;
}
