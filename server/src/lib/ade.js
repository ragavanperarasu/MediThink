import { HttpError } from './http.js';

/*
 * Reading a SaatruAI export.
 *
 * MediThink does no document parsing of its own. SaatruAI has already turned
 * the PDF into reading-order Markdown and typed chunks, each grounded to a box
 * on its page; this file reads that JSON into the slimmer shape MediThink
 * stores, and keeps the boxes so every value can be shown where it was printed.
 *
 * Two shapes are accepted, because both are in use:
 *   SaatruAI      chunks[].grounding = [{ page, box: { l, t, r, b } }]
 *   LandingAI ADE chunks[].grounding = { page, box: { left, top, right, bottom } }
 * and either may arrive wrapped in { document }, { result } or { data }.
 */

/** Characters of document sent to the model. Lab reports sit far below this. */
const MAX_MODEL_CHARS = 200_000;
const MAX_CHUNK_CHARS = 20_000;

const num = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round = (value) => Math.round(value * 10000) / 10000;

/** A normalized box from either spelling, or null when it cannot be placed. */
function readBox(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const l = num(raw.l ?? raw.left);
  const t = num(raw.t ?? raw.top);
  const r = num(raw.r ?? raw.right);
  const b = num(raw.b ?? raw.bottom);
  if (l === null || t === null || r === null || b === null) return null;
  // Only fractions of the page can be drawn without knowing the page size.
  if ([l, t, r, b].some((v) => v < -0.01 || v > 1.01)) return null;
  const box = {
    l: round(clamp01(Math.min(l, r))),
    t: round(clamp01(Math.min(t, b))),
    r: round(clamp01(Math.max(l, r))),
    b: round(clamp01(Math.max(t, b))),
  };
  return box.r > box.l && box.b > box.t ? box : null;
}

/** The smallest box around several. */
function unionBox(boxes) {
  const real = boxes.filter(Boolean);
  if (real.length === 0) return null;
  return {
    l: Math.min(...real.map((b) => b.l)),
    t: Math.min(...real.map((b) => b.t)),
    r: Math.max(...real.map((b) => b.r)),
    b: Math.max(...real.map((b) => b.b)),
  };
}

function readGrounding(chunk) {
  const first = Array.isArray(chunk.grounding) ? chunk.grounding[0] : chunk.grounding;
  const page = num(first?.page) ?? num(chunk.page) ?? 0;
  return { page: Math.max(0, Math.round(page)), box: readBox(first?.box ?? first) };
}

/**
 * Table rows with their own boxes, from SaatruAI's per-cell grounding. This is
 * what lets a single result be highlighted rather than the whole table.
 */
function readRows(chunk) {
  const table = chunk.table ?? chunk.extra?.table;
  if (!Array.isArray(table?.rows) || !Array.isArray(table?.cellGrounding)) return undefined;
  const rows = table.rows
    .map((cells, index) => {
      if (!Array.isArray(cells)) return null;
      const box = unionBox((table.cellGrounding[index] ?? []).map(readBox));
      const text = cells.map((cell) => String(cell ?? '')).join(' | ').trim();
      return box && text ? { text, box } : null;
    })
    .filter(Boolean);
  return rows.length ? rows : undefined;
}

function normalizeChunk(chunk, index) {
  if (!chunk || typeof chunk !== 'object') return null;
  const text = String(chunk.markdown ?? chunk.text ?? '').trim();
  if (!text) return null;
  const { page, box } = readGrounding(chunk);
  return {
    id: String(chunk.id ?? chunk.chunk_id ?? `chunk_${index}`),
    type: String(chunk.type ?? chunk.chunk_type ?? 'text'),
    page,
    text: text.slice(0, MAX_CHUNK_CHARS),
    box,
    rows: readRows(chunk),
    confidence: num(chunk.confidence),
    order: num(chunk.order),
  };
}

function unwrap(raw) {
  let doc = raw;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
    if (Array.isArray(doc.chunks) || typeof doc.markdown === 'string') return doc;
    const inner = doc.document ?? doc.result ?? doc.data;
    if (!inner) return doc;
    doc = inner;
  }
  return doc;
}

/** Reads a parsed SaatruAI export, or throws a 422 that says what is wrong. */
export function readAdeDocument(raw) {
  const doc = unwrap(raw);

  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || (!Array.isArray(doc.chunks) && typeof doc.markdown !== 'string')) {
    throw new HttpError(422, 'That JSON is not a SaatruAI export. Download it from SaatruAI with Download → JSON.');
  }

  const chunks = (Array.isArray(doc.chunks) ? doc.chunks : [])
    .map(normalizeChunk)
    .filter(Boolean);

  // SaatruAI numbers its chunks in reading order; honour that when every chunk has one.
  if (chunks.length && chunks.every((chunk) => chunk.order !== null)) {
    chunks.sort((a, b) => a.order - b.order);
  }

  const markdown =
    typeof doc.markdown === 'string' && doc.markdown.trim()
      ? doc.markdown
      : chunks.map((chunk) => chunk.text).join('\n\n');

  if (!markdown.trim()) {
    throw new HttpError(
      422,
      'This export has no text in it. If the PDF is a scan, start the OCR engine in SaatruAI and parse it again.',
    );
  }

  const lastPage = chunks.reduce((max, chunk) => Math.max(max, chunk.page), -1);
  const pageCount =
    num(doc.pageCount) ?? num(doc.stats?.pageCount) ?? num(doc.metadata?.page_count) ?? Math.max(1, lastPage + 1);

  return {
    markdown,
    chunks: chunks.map(({ order: _order, ...chunk }, index) => ({ ...chunk, ref: `C${index + 1}` })),
    pageCount,
    filename: typeof doc.filename === 'string' ? doc.filename : '',
    classification: typeof doc.classification?.label === 'string' ? doc.classification.label : '',
    meanConfidence: num(doc.stats?.meanConfidence),
    reviewCount: Array.isArray(doc.stats?.reviewQueue) ? doc.stats.reviewQueue.length : 0,
  };
}

/**
 * The document as the model reads it: every block behind a tag it can cite,
 * e.g. "[C12 · page 2 · table]". The tags are what make an answer checkable.
 */
export function documentForModel(report, chunks = report.chunks, { headerFor } = {}) {
  if (!chunks?.length) return report.markdown.slice(0, MAX_MODEL_CHARS);

  let out = '';
  for (const chunk of chunks) {
    const header = headerFor?.(chunk) ?? '';
    const block = `${header}[${chunk.ref} · page ${chunk.page + 1} · ${chunk.type}]\n${chunk.text}\n\n`;
    if (out.length + block.length > MAX_MODEL_CHARS) {
      out += '[The rest of the document was cut to fit.]\n';
      break;
    }
    out += block;
  }
  return out;
}

/**
 * The whole upload for questions, with a heading where each document begins,
 * so an answer can say which report a figure came from.
 */
export function bundleForModel(report) {
  const docs = report.documents ?? [];
  if (docs.length < 2) return documentForModel(report);

  const startOf = new Map();
  for (const doc of docs) {
    const label = [doc.title || doc.category, doc.date, `pages ${doc.pages.map((p) => p + 1).join(', ')}`].filter(Boolean).join(' · ');
    startOf.set(doc.pages[0], `=== Document ${doc.n}: ${label} ===\n`);
  }
  const ordered = docs.flatMap((doc) => report.chunks.filter((c) => doc.pages.includes(c.page)));
  const seen = new Set();
  return documentForModel(report, ordered, {
    headerFor: (chunk) => {
      const header = startOf.get(chunk.page);
      if (!header || seen.has(chunk.page)) return '';
      seen.add(chunk.page);
      return header;
    },
  });
}

/** Lowercase, no spaces or thousands separators — "1,23,000 " and "123000" match. */
const squash = (text) => String(text ?? '').toLowerCase().replace(/[\s,]/g, '');

/**
 * Finds where a value is printed, and whether it really is.
 *
 * The model names a block; this checks the printed value actually appears in
 * it. A value that cannot be found is kept but marked unverified, so the
 * reader knows which figures to check against the page by eye.
 */
export function locateValue(report, { name, value, source }, chunks = report.chunks ?? []) {
  const wanted = squash(value);
  const label = squash(name);

  if (!wanted) return { chunk: null, box: null, verified: false };

  if (chunks.length === 0) {
    return { chunk: null, box: null, verified: squash(report.markdown).includes(wanted) };
  }

  const cited = chunks.find((chunk) => chunk.ref.toLowerCase() === String(source ?? '').trim().toLowerCase());
  const holds = (chunk) => squash(chunk.text).includes(wanted);

  // The cited block, or failing that the first block carrying both the
  // test's name and its reading.
  const chunk =
    (cited && holds(cited) && cited) ||
    chunks.find((c) => holds(c) && squash(c.text).includes(label)) ||
    null;

  if (!chunk) return { chunk: cited ?? null, box: cited?.box ?? null, verified: false };

  // Narrow to the table row when the export has per-row boxes.
  const row =
    chunk.rows?.find((r) => squash(r.text).includes(wanted) && squash(r.text).includes(label)) ||
    chunk.rows?.find((r) => squash(r.text).includes(wanted));

  return { chunk, box: row?.box ?? chunk.box ?? null, verified: true };
}
