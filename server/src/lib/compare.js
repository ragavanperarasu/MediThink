/*
 * Changes over time: the same test across reports of the same kind.
 *
 * Accuracy rules, in order of importance:
 *   1. Every number shown is computed here, in code, from values already
 *      verified against the report text. The model never does arithmetic.
 *   2. A change is computed only when both values are plain numbers in the
 *      same unit and both were found on the page. Otherwise both values are
 *      shown and the reason no change was computed is given.
 *   3. Tests are lined up by exact name first. The model is asked only about
 *      the names left over ("FBS" ↔ "Fasting Blood Sugar"), and every pair it
 *      returns is checked here; those rows are marked as matched by meaning.
 *   4. No change is called better or worse — only up, down, and in or out of
 *      the range each report printed.
 */

const OUT = new Set(['low', 'high', 'abnormal']);

/** "Fasting Glucose", "FASTING  GLUCOSE" and "Fasting-Glucose" are one name. */
export const nameKey = (name) => String(name ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

/** "mg/dl", "mg / dL" and "MG/DL" are one unit; "µ" and "u" are the same letter. */
export const unitKey = (unit) => String(unit ?? '').toLowerCase().replace(/µ|μ/g, 'u').replace(/\s+/g, '');

/**
 * The number in a printed value, or null when it is not a plain number.
 * "176.0" → 176.0 · "1,23,000" → 123000 · "64%" → 64 (unit "%") ·
 * "<5", "92 / 57", "1+", "Positive" → null.
 */
export function readNumber(value, unit) {
  const text = String(value ?? '').trim();
  const match = /^(-?\d[\d,]*(?:\.\d+)?)\s*(.*)$/.exec(text);
  if (!match) return null;
  const [, digits, rest] = match;
  if (rest) {
    // A unit printed inside the value is allowed; anything with another
    // number in it (a ratio, "92 / 57", "1+") is not a single reading.
    if (unit || /[\d+]/.test(rest)) return null;
  }
  const plain = digits.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(plain)) return null;
  return {
    number: Number(plain),
    decimals: plain.includes('.') ? plain.split('.')[1].length : 0,
    unit: unit || rest,
  };
}

/** b − a, without floating-point noise, to the precision the reports printed. */
function difference(a, b) {
  const decimals = Math.max(a.decimals, b.decimals);
  const scale = 10 ** decimals;
  const delta = (Math.round(b.number * scale) - Math.round(a.number * scale)) / scale;
  const percent = a.number === 0 ? null : (delta / Math.abs(a.number)) * 100;
  return {
    delta: delta.toFixed(decimals),
    percent: percent === null ? null : percent.toFixed(1),
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
  };
}

/** Where the latest reading sits against its own printed range, compared with the one before. */
function rangeChange(before, after) {
  if (!before || !after || before.flag === 'unknown' || after.flag === 'unknown') return null;
  const wasOut = OUT.has(before.flag);
  const isOut = OUT.has(after.flag);
  if (wasOut && !isOut) return 'now-in';
  if (!wasOut && isOut) return 'now-out';
  if (wasOut && isOut) return 'still-out';
  return 'still-in';
}

/** The change between the last two readings of a row, or why none was computed. */
function changeOf(cells) {
  const present = cells.filter(Boolean);
  if (present.length < 2) return { computed: false, reason: 'In one report only' };
  const [before, after] = present.slice(-2);
  const base = { from: before.n, to: after.n, range: rangeChange(before, after) };

  if (!before.verified || !after.verified) {
    return { ...base, computed: false, reason: 'A value was not found exactly in the report text — check it on the page' };
  }
  const a = readNumber(before.value, before.unit);
  const b = readNumber(after.value, after.unit);
  if (!a || !b) {
    const same = nameKey(before.value) === nameKey(after.value);
    return { ...base, computed: false, text: true, direction: same ? 'same' : 'changed', reason: same ? 'Unchanged' : 'Not a single number, so no difference is calculated' };
  }
  if (unitKey(a.unit) !== unitKey(b.unit)) {
    return { ...base, computed: false, reason: `Units differ (${a.unit || 'none'} vs ${b.unit || 'none'}), so no difference is calculated` };
  }
  return { ...base, computed: true, unit: b.unit, ...difference(a, b) };
}

/** A value as a comparison cell — what it said, and where to find it. */
function cell(doc, value) {
  return {
    n: doc.n,
    value: value.value,
    unit: value.unit,
    range: value.range,
    flag: value.flag,
    verified: value.verified,
    page: value.page,
    box: value.box ?? null,
    source: value.source,
  };
}

/**
 * Each document's values, keyed by name. A name that appears twice in one
 * document ("Fasting" under glucose and under urine) is told apart by its
 * section; within one document a key is never shared.
 */
function keyed(doc) {
  const counts = new Map();
  for (const v of doc.values) counts.set(nameKey(v.name), (counts.get(nameKey(v.name)) ?? 0) + 1);
  const out = [];
  const used = new Set();
  doc.values.forEach((v, i) => {
    const base = nameKey(v.name);
    if (!base) return;
    let key = counts.get(base) > 1 ? `${base}@${nameKey(v.section)}` : base;
    if (used.has(key)) key = `${key}#${i}`;
    used.add(key);
    out.push({ key, id: `d${doc.n}v${i}`, value: v });
  });
  return out;
}

const isNumeric = (v) => Boolean(readNumber(v.value, v.unit));

/** Groups of ready documents of one kind that have results to compare, oldest first. */
export function comparableGroups(documents) {
  const byCategory = new Map();
  for (const doc of documents) {
    if (doc.status !== 'ready' || !doc.values?.length) continue;
    if (!byCategory.has(doc.category)) byCategory.set(doc.category, []);
    byCategory.get(doc.category).push(doc);
  }
  return [...byCategory.entries()].filter(([, docs]) => docs.length > 1).map(([category, docs]) => ({ category, docs }));
}

/**
 * The tests that exact naming could not line up — what the model is asked
 * about. Returned as { id → { doc, value } } plus the text the model reads.
 */
export function leftovers(group) {
  const perDoc = group.docs.map(keyed);
  const seen = new Map();
  perDoc.flat().forEach(({ key }) => seen.set(key, (seen.get(key) ?? 0) + 1));

  const byId = new Map();
  const lines = [];
  group.docs.forEach((doc, i) => {
    const alone = perDoc[i].filter(({ key }) => seen.get(key) === 1);
    if (!alone.length) return;
    lines.push(`Report ${doc.n} (${doc.date || 'no date'}):`);
    for (const { id, value } of alone) {
      byId.set(id, { doc, value });
      lines.push(`  ${id} · ${value.name}${value.section ? ` · section: ${value.section}` : ''} · ${value.value}${value.unit ? ` ${value.unit}` : ''}`);
    }
  });
  return { byId, text: lines.join('\n') };
}

/**
 * Checks the model's proposed pairs. A pair survives only when every id is
 * a real leftover, no two come from the same report, all are numbers or all
 * are words, and no two state different units.
 */
export function checkPairs(parsed, byId) {
  const taken = new Set();
  const groups = [];
  for (const raw of Array.isArray(parsed?.groups) ? parsed.groups : []) {
    if (!Array.isArray(raw)) continue;
    const ids = [...new Set(raw.map(String))];
    if (ids.length < 2 || ids.some((id) => !byId.has(id) || taken.has(id))) continue;
    const items = ids.map((id) => byId.get(id));
    const docs = new Set(items.map((x) => x.doc.n));
    if (docs.size !== items.length) continue;
    const numeric = items.map((x) => isNumeric(x.value));
    if (numeric.some((v) => v !== numeric[0])) continue;
    const units = new Set(items.map((x) => unitKey(readNumber(x.value.value, x.value.unit)?.unit ?? x.value.unit)).filter(Boolean));
    if (units.size > 1) continue;
    ids.forEach((id) => taken.add(id));
    groups.push(ids);
  }
  return groups;
}

/**
 * The comparison table for one group of documents: one row per test, one
 * cell per document (null where that report did not have it), and the
 * change between its last two readings.
 */
export function buildComparison(group, modelPairs = []) {
  const { docs } = group;
  const perDoc = docs.map(keyed);
  const rows = new Map();
  const order = [];

  const rowFor = (key, name, section, matchedBy) => {
    if (!rows.has(key)) {
      rows.set(key, { key, name, section, matchedBy, names: new Set(), cells: docs.map(() => null) });
      order.push(key);
    }
    return rows.get(key);
  };

  // Model pairs first, so their ids are not also placed by name.
  const paired = new Map();
  modelPairs.forEach((ids, i) => ids.forEach((id) => paired.set(id, `model${i}`)));

  // Newest document first, so rows follow the latest report's order.
  for (let d = docs.length - 1; d >= 0; d -= 1) {
    for (const { key, id, value } of perDoc[d]) {
      let rowKey = paired.get(id) ?? key;
      // Same name but one is a number and the other a word ("176" vs "1+"):
      // not the same measurement, so not the same row.
      const existing = rows.get(rowKey)?.cells.find(Boolean);
      if (existing && !paired.has(id) && isNumeric(existing) !== isNumeric(value)) rowKey = `${key}~${d}`;
      const row = rowFor(rowKey, value.name, value.section, paired.has(id) ? 'meaning' : 'name');
      row.names.add(value.name);
      if (!row.cells[d]) row.cells[d] = cell(docs[d], value);
    }
  }

  const tableRows = order.map((key) => {
    const row = rows.get(key);
    return {
      name: row.name,
      section: row.section,
      matchedBy: row.matchedBy,
      names: [...row.names],
      cells: row.cells,
      change: changeOf(row.cells),
    };
  });

  return {
    category: group.category,
    documents: docs.map((d) => ({ n: d.n, title: d.title, date: d.date, dateISO: d.dateISO })),
    // Rows found in more than one report come first; the rest are listed after.
    rows: [...tableRows.filter((r) => r.cells.filter(Boolean).length > 1), ...tableRows.filter((r) => r.cells.filter(Boolean).length < 2)],
    narrative: '',
  };
}

/** The comparison as plain text — what the explaining model, and Ask, read. */
export function comparisonText(comparison, labelOf = (c) => c) {
  const head = comparison.documents.map((d) => `Report ${d.n} (${d.date || 'no date'})`).join(' | ');
  const lines = [`${labelOf(comparison.category)} — ${head}`];
  for (const row of comparison.rows) {
    if (row.cells.filter(Boolean).length < 2) continue;
    const values = row.cells
      .map((c, i) => `R${comparison.documents[i].n}: ${c ? `${c.value}${c.unit ? ` ${c.unit}` : ''}${c.range ? ` (range ${c.range})` : ''}${OUT.has(c.flag) ? ` [${c.flag}]` : ''}` : '—'}`)
      .join('; ');
    const ch = row.change;
    const change = ch.computed
      ? `change ${ch.direction === 'up' ? '+' : ''}${ch.delta}${ch.unit ? ` ${ch.unit}` : ''}${ch.percent !== null ? ` (${ch.direction === 'up' ? '+' : ''}${ch.percent}%)` : ''}`
      : `no difference computed: ${ch.reason}`;
    const range = ch.range ? `; ${ch.range.replace('-', ' ')}` : '';
    lines.push(`- ${row.name}: ${values}; ${change}${range}`);
  }
  return lines.join('\n');
}

/** Every number written in a text, as the same tokens either side compares. */
const numbersIn = (text) => new Set((String(text).replace(/(\d),(\d)/g, '$1$2').match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));

/**
 * True when every number in the explanation appears in the table it was
 * given. One stray figure and the explanation is not shown.
 */
export function narrativeIsFaithful(narrative, table) {
  const allowed = numbersIn(table);
  const strays = [...numbersIn(narrative)].filter((n) => !allowed.has(n));
  return { ok: strays.length === 0, strays };
}
