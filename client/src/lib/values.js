/** How each flag is drawn. "unknown" draws as no claim at all. */
export const FLAGS = {
  high: { label: 'High', color: '#dc2626', bg: 'rgba(220,38,38,0.09)' },
  low: { label: 'Low', color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  abnormal: { label: 'Abnormal', color: '#c026d3', bg: 'rgba(192,38,211,0.09)' },
  normal: { label: 'In range', color: '#16a34a', bg: 'rgba(22,163,74,0.09)' },
  unknown: { label: 'No range', color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
};

export const flagInfo = (flag) => FLAGS[flag] ?? FLAGS.unknown;

export const isOutOfRange = (flag) => flag === 'high' || flag === 'low' || flag === 'abnormal';

const NUMBER = /-?\d+(?:\.\d+)?/;

/** A plain number from a printed value, or null for "<5", "Positive", "1+". */
export function readNumber(value) {
  const cleaned = String(value ?? '').replace(/,/g, '').trim();
  if (/^[<>≤≥]/.test(cleaned)) return null;
  const match = cleaned.match(/^-?\d+(?:\.\d+)?$/) || cleaned.match(/^(-?\d+(?:\.\d+)?)\s*[a-zA-Zµ/%^]*$/);
  return match ? Number.parseFloat(match[1] ?? match[0]) : null;
}

/** { lo, hi } from "13.0 - 17.0", "< 200", "up to 40", "> 60"; null otherwise. */
export function readRange(range) {
  const text = String(range ?? '').replace(/,/g, '');
  let match = text.match(new RegExp(`(${NUMBER.source})\\s*(?:-|–|—|to)\\s*(${NUMBER.source})`, 'i'));
  if (match) {
    const lo = Number.parseFloat(match[1]);
    const hi = Number.parseFloat(match[2]);
    return hi > lo ? { lo, hi } : null;
  }
  match = text.match(new RegExp(`^\\s*(?:<|≤|<=|up\\s*to|upto|below|less\\s+than)\\s*(${NUMBER.source})`, 'i'));
  if (match) return { lo: null, hi: Number.parseFloat(match[1]) };
  match = text.match(new RegExp(`^\\s*(?:>|≥|>=|above|more\\s+than|greater\\s+than)\\s*(${NUMBER.source})`, 'i'));
  if (match) return { lo: Number.parseFloat(match[1]), hi: null };
  return null;
}

/**
 * Where a value sits on a bar whose middle band is the printed range, as a
 * percentage. Null when either side is not a plain number — no bar is drawn
 * rather than a misleading one.
 */
export function rangePosition(value, range) {
  const v = readNumber(value);
  const r = readRange(range);
  if (v === null || !r) return null;
  const clamp = (p) => Math.min(97, Math.max(3, p));

  if (r.lo !== null && r.hi !== null) {
    return { band: [30, 70], at: clamp(30 + ((v - r.lo) / (r.hi - r.lo)) * 40) };
  }
  if (r.hi !== null) {
    return { band: [0, 65], at: clamp(r.hi === 0 ? 50 : (v / r.hi) * 65) };
  }
  return { band: [35, 100], at: clamp(r.lo === 0 ? 50 : (v / r.lo) * 35) };
}
