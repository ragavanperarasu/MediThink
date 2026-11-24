import mongoose from 'mongoose';
import Report from '../models/Report.js';
import { documentForModel } from './ade.js';
import { HttpError } from './http.js';
import { LANGUAGES, languageInstruction, languageOf } from './languages.js';
import { LIVE_PROMPT, MULTI_QA_PROMPT, QA_PROMPT } from './prompts.js';
import { REPORT_TYPE_CONTEXT, REPORT_TYPE_LABEL } from './reportTypes.js';

/*
 * What the Assistant answers from. Three scopes:
 *   all          every report of the profile, newest first
 *   type:<kind>  every report of one kind — "how has my sugar changed?"
 *   doc:<id>:<n> one report only, from its own page text, every figure pinned
 *
 * Across several reports the model gets each report's summary and the
 * results read from it, labelled D1, D2, … so an answer can say which report
 * and date a figure comes from. One report gets its full page text.
 */

/** How many earlier turns go back with each question. */
const MAX_HISTORY = 12;
/** Upper bound on the text handed over for "all" or a kind. */
const MAX_MULTI_CHARS = 150_000;
const FLAGGED = new Set(['high', 'low', 'abnormal']);

/** Checks a scope string; anything else is refused. */
export function parseScope(raw) {
  const scope = String(raw ?? 'all').trim() || 'all';
  if (scope === 'all') return { scope, kind: 'all' };
  const type = /^type:([a-z]+)$/.exec(scope);
  if (type && REPORT_TYPE_LABEL[type[1]]) return { scope, kind: 'type', category: type[1] };
  const doc = /^doc:([a-f0-9]{24}):(\d{1,3})$/.exec(scope);
  if (doc && mongoose.Types.ObjectId.isValid(doc[1])) return { scope, kind: 'doc', reportId: doc[1], n: Number(doc[2]) };
  throw new HttpError(400, 'Choose what to ask about.');
}

/** A document that has been read and can be asked about. */
const readable = (doc) => doc && doc.status !== 'failed' && Boolean(doc.summary);

/** The reports a scope covers, scoped to the profile in use (`owner`). */
export async function resolveScope(owner, parsed) {
  if (parsed.kind === 'doc') {
    const report = await Report.findOne({ _id: parsed.reportId, ...owner }, { title: 1, chunks: 1, documents: 1, markdown: 1 }).lean();
    const doc = report?.documents?.find((d) => d.n === parsed.n);
    if (!readable(doc)) throw new HttpError(404, 'That report is not ready to ask about.');
    return {
      ...parsed,
      label: doc.title || REPORT_TYPE_LABEL[doc.category] || report.title,
      report,
      doc,
      chunks: (report.chunks ?? []).filter((c) => doc.pages.includes(c.page)),
      several: report.documents.length > 1,
    };
  }

  const uploads = await Report.find(owner, { title: 1, documents: 1, createdAt: 1 }).lean();
  const docs = uploads
    .flatMap((upload) => (upload.documents ?? [])
      .filter((doc) => readable(doc) && (parsed.kind === 'all' || doc.category === parsed.category))
      .map((doc) => ({ upload, doc })))
    .sort((a, b) =>
      (b.doc.dateISO || '').localeCompare(a.doc.dateISO || '') ||
      new Date(b.upload.createdAt) - new Date(a.upload.createdAt));
  return {
    ...parsed,
    label: parsed.kind === 'all' ? 'All reports' : REPORT_TYPE_LABEL[parsed.category],
    sources: docs.map(({ upload, doc }, i) => ({ ref: `D${i + 1}`, upload, doc })),
  };
}

/** Upper bound on the results sent to the client for drawing charts. */
const MAX_CHART_RESULTS = 3000;

/**
 * Every result in the scope, slim, for the charts an answer may ask for. The
 * client draws charts from these — never from figures in the answer text.
 * `ref` is the report (D3) across reports; `cite` the block (C12) in one.
 */
function chartResults(resolved) {
  const row = (doc, v, ref) => ({
    ref,
    cite: resolved.kind === 'doc' ? v.source || '' : '',
    date: doc.date || '',
    dateISO: doc.dateISO || '',
    name: v.name,
    section: v.section || '',
    value: v.value,
    unit: v.unit || '',
    range: v.range || '',
    flag: v.flag || 'unknown',
  });
  const rows = resolved.kind === 'doc'
    ? (resolved.doc.values ?? []).map((v) => row(resolved.doc, v, ''))
    : resolved.sources.flatMap(({ ref, doc }) => (doc.values ?? []).map((v) => row(doc, v, ref)));
  return rows.slice(0, MAX_CHART_RESULTS);
}

/** What the client needs to show the thread and turn citations into links. */
export function threadPayload(resolved, messages) {
  const flaggedNames = (docs) => [...new Set(docs.flatMap((d) => (d.values ?? []).filter((v) => FLAGGED.has(v.flag)).map((v) => v.name)))].slice(0, 3);
  const base = { scope: resolved.scope, kind: resolved.kind, label: resolved.label, messages, results: chartResults(resolved) };
  if (resolved.kind === 'doc') {
    return {
      ...base,
      reportId: String(resolved.report._id),
      n: resolved.doc.n,
      category: resolved.doc.category,
      several: resolved.several,
      flagged: flaggedNames([resolved.doc]),
      chunks: resolved.chunks.map(({ ref, page, box, type, text }) => ({ ref, page, box, type, text })),
    };
  }
  return {
    ...base,
    count: resolved.sources.length,
    flagged: flaggedNames(resolved.sources.map((s) => s.doc)),
    sources: resolved.sources.map(({ ref, upload, doc }) => ({
      ref,
      reportId: String(upload._id),
      n: doc.n,
      several: upload.documents.length > 1,
      title: doc.title || REPORT_TYPE_LABEL[doc.category] || upload.title,
      date: doc.date || '',
      category: doc.category,
    })),
  };
}

/** A summary's own block citations ([C12]) mean nothing outside its upload. */
const withoutBlockCitations = (text) => String(text ?? '').replace(/\s*\[(?:C\d{1,5}\s*[,;]?\s*)+\]/g, '');

/** Several reports as the model is handed them: summary and results, each under its id. */
function reportsForModel(sources, max = MAX_MULTI_CHARS) {
  let out = '';
  for (const { ref, upload, doc } of sources) {
    const heading = [doc.title || upload.title, REPORT_TYPE_LABEL[doc.category] ?? 'Report', doc.date || 'no date printed'].join(' · ');
    const results = (doc.values ?? []).map((v) => {
      const where = v.section ? `${v.section} › ` : '';
      const range = v.range ? ` (the report's range: ${v.range})` : '';
      const flag = FLAGGED.has(v.flag) ? ` — flagged ${v.flag}` : '';
      return `- ${where}${v.name}: ${v.value}${v.unit ? ` ${v.unit}` : ''}${range}${flag}`;
    });
    const block = `=== ${ref}: ${heading} ===\nSummary:\n${withoutBlockCitations(doc.summary)}\n${results.length ? `\nResults:\n${results.join('\n')}\n` : ''}\n`;
    if (out.length + block.length > max) {
      out += '[Older reports were left out to fit.]\n';
      break;
    }
    out += block;
  }
  return out;
}

/** The results read from one report, by the names a chart must use. */
function resultsList(doc, heading = 'Results read from this report (for charts, use these names)') {
  const values = doc.values ?? [];
  if (!values.length) return '';
  const lines = values.map((v) => `- ${v.section ? `${v.section} › ` : ''}${v.name}: ${v.value}${v.unit ? ` ${v.unit}` : ''}${v.range ? ` (range ${v.range})` : ''}`);
  return `\n\n${heading}:\n${lines.join('\n')}`;
}

/**
 * What is sent to the model for one question within a scope, with the thread
 * so far. `language` is the code the answer is written in, whatever language
 * the question is asked in. `voice` is a spoken conversation: the answer is
 * read aloud, so it is kept short and plain.
 */
export function askMessages(resolved, messages, question, language = 'en', { voice = false } = {}) {
  const history = messages.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content }));
  let context;
  if (resolved.kind === 'doc') {
    const { report, doc, chunks } = resolved;
    const kind = REPORT_TYPE_CONTEXT[doc.category] ?? REPORT_TYPE_CONTEXT.other;
    context = [
      { role: 'system', content: QA_PROMPT },
      { role: 'system', content: `${kind}\n\nReport:\n\n---\n${documentForModel(report, chunks)}\n---${resultsList(doc)}` },
    ];
  } else {
    if (!resolved.sources.length) throw new HttpError(404, 'There are no reports to ask about here yet.');
    context = [
      { role: 'system', content: MULTI_QA_PROMPT },
      { role: 'system', content: `Reports (${resolved.label}), newest first:\n\n${reportsForModel(resolved.sources)}` },
    ];
  }
  // Last before the question, so it governs this answer even when earlier ones were in another language.
  const spoken = voice
    ? [{ role: 'system', content: 'This answer will be spoken aloud in a voice conversation. Reply in two to four short, natural spoken sentences: no tables, charts, headings, bullet lists or other Markdown. Still put the citation tag after each figure. If the question needs more detail, give the key point and say the full answer is in the chat.' }]
    : [];
  return [...context, ...history, ...spoken, { role: 'system', content: languageInstruction(language) }, { role: 'user', content: question }];
}

/*
 * GPT-Live voice. Its instructions hold 16,384 tokens in all, so the reports
 * are cut to MAX_LIVE_CHARS (about 10,000 tokens) — the newest first.
 */
const MAX_LIVE_CHARS = 40_000;

export const spokenLanguage = (code) => {
  const lang = LANGUAGES[languageOf(code)];
  if (code === 'en' || !LANGUAGES[code]) return 'Speak English.';
  return `Speak ${lang.name} throughout, even when they speak English or another language. Use simple, everyday ${lang.name}. Say test names as the report prints them.`;
};

/** The whole instructions for a GPT-Live session within a scope. */
export function liveInstructions(resolved, language = 'en') {
  let context;
  if (resolved.kind === 'doc') {
    const { report, doc, chunks } = resolved;
    const kind = REPORT_TYPE_CONTEXT[doc.category] ?? REPORT_TYPE_CONTEXT.other;
    const text = (chunks.length ? chunks.map((c) => c.text).join('\n\n') : report.markdown || '').slice(0, MAX_LIVE_CHARS);
    context = `${kind}\n\nThe report (${doc.title || REPORT_TYPE_LABEL[doc.category] || report.title}${doc.date ? `, ${doc.date}` : ''}):\n---\n${text}\n---${resultsList(doc, 'Results read from this report')}`;
  } else {
    if (!resolved.sources.length) throw new HttpError(404, 'There are no reports to talk about here yet.');
    context = `Their reports (${resolved.label}), newest first:\n\n${reportsForModel(resolved.sources, MAX_LIVE_CHARS)}`;
  }
  return `${LIVE_PROMPT}\n\n${spokenLanguage(language)}\n\n${context}`;
}
