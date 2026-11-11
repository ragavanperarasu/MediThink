import { SPLIT_PROMPT } from './prompts.js';
import { isReportType, REPORT_TYPE_GUIDE, REPORT_TYPES } from './reportTypes.js';

/*
 * Layer one: one uploaded PDF → the separate documents inside it, in order.
 *
 * The model sees only the JSON's text, page by page — never the PDF. What it
 * returns is checked rather than trusted: every page must land in exactly one
 * document, and a page it forgot joins the document before it, because a
 * page with nothing recognisable on it is almost always a continuation.
 */

/** Text per page sent to the splitter. The top of a page — letterhead, title, date — is what decides it. */
const PAGE_CHARS = 1800;

const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** The JSON's blocks regrouped by page, as the splitter reads them. */
export function pagesForSplitter(report) {
  const pageCount = Math.max(1, report.source?.pageCount ?? 1);
  const byPage = Array.from({ length: pageCount }, () => []);
  for (const chunk of report.chunks ?? []) {
    if (chunk.page >= 0 && chunk.page < pageCount) byPage[chunk.page].push(`[${chunk.type}] ${chunk.text}`);
  }
  return byPage
    .map((blocks, page) => {
      let body = blocks.join('\n').replace(/\n{3,}/g, '\n\n');
      if (body.length > PAGE_CHARS) body = `${body.slice(0, PAGE_CHARS)}\n[…rest of page cut]`;
      return `=== Page ${page + 1} ===\n${body || '[no text on this page]'}`;
    })
    .join('\n\n');
}

export const splitterPrompt = () =>
  SPLIT_PROMPT(REPORT_TYPES.map((id) => `- ${id}: ${REPORT_TYPE_GUIDE[id]}`).join('\n'));

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIso(value) {
  const match = ISO.exec(value);
  if (!match) return '';
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? value : '';
}

/** Day-first reading of a printed date — the fallback when the model gives no dateISO. */
function isoFromPrinted(printed) {
  const match = /(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})/.exec(printed);
  if (!match) return '';
  const [, d, m, y] = match;
  return validIso(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
}

/**
 * Checks the model's split and puts it in reading order: documents grouped by
 * kind (kinds in the order they first appear in the PDF), and within a kind
 * oldest first, so two blood reports read as a before and after.
 */
export function cleanSplit(parsed, pageCount) {
  const owner = new Array(pageCount).fill(-1);
  const docs = [];

  for (const raw of Array.isArray(parsed?.documents) ? parsed.documents : []) {
    if (!raw || typeof raw !== 'object') continue;
    const pages = (Array.isArray(raw.pages) ? raw.pages : [])
      .map((p) => Number.parseInt(p, 10) - 1)
      .filter((p) => Number.isInteger(p) && p >= 0 && p < pageCount && owner[p] === -1);
    if (!pages.length) continue;

    const index = docs.length;
    pages.forEach((p) => { owner[p] = index; });
    const category = text(raw.category, 40).toLowerCase();
    const date = text(raw.date, 80);
    docs.push({
      pages,
      category: isReportType(category) ? category : 'other',
      title: text(raw.title, 160),
      date,
      dateISO: validIso(text(raw.dateISO, 10)) || isoFromPrinted(date),
      facility: text(raw.facility, 200),
    });
  }

  if (!docs.length) return null;

  // A page the model left out joins the document before it (or after, for page 1).
  for (let p = 0; p < pageCount; p += 1) {
    if (owner[p] !== -1) continue;
    const before = owner.slice(0, p).reverse().find((o) => o !== -1);
    const target = before ?? owner.find((o) => o !== -1);
    owner[p] = target;
    docs[target].pages.push(p);
  }
  docs.forEach((doc) => doc.pages.sort((a, b) => a - b));

  const firstPage = (doc) => doc.pages[0];
  const categoryStart = new Map();
  for (const doc of docs) {
    categoryStart.set(doc.category, Math.min(categoryStart.get(doc.category) ?? Infinity, firstPage(doc)));
  }

  docs.sort((a, b) => {
    if (a.category !== b.category) return categoryStart.get(a.category) - categoryStart.get(b.category);
    if (a.dateISO && b.dateISO && a.dateISO !== b.dateISO) return a.dateISO < b.dateISO ? -1 : 1;
    if (Boolean(a.dateISO) !== Boolean(b.dateISO)) return a.dateISO ? -1 : 1;
    return firstPage(a) - firstPage(b);
  });

  return docs.map((doc, i) => ({ ...doc, n: i + 1 }));
}

/** The whole PDF as one document — used when the split cannot be read. */
export function singleDocument(pageCount, category = 'other') {
  return [{
    n: 1,
    pages: Array.from({ length: pageCount }, (_, i) => i),
    category: isReportType(category) ? category : 'other',
    title: '',
    date: '',
    dateISO: '',
    facility: '',
  }];
}
