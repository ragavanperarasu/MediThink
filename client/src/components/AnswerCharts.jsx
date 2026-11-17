import { useLayoutEffect, useRef, useState } from 'react';
import { Box, Stack, Tooltip, Typography } from '@mui/material';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import { flagInfo, rangePosition, readNumber, readRange } from '../lib/values';

/*
 * Charts inside an Assistant answer. The model writes only which chart and
 * which tests — a ```chart block such as {"type":"trend","test":"HbA1c"} —
 * and every figure drawn here comes from the results already read from the
 * reports (`results`, from the thread). A test that cannot be found draws
 * nothing, rather than something made up.
 *
 *   trend  one test across reports, oldest to newest, over its normal band
 *   range  up to four tests, each latest value on its range bar
 */

const key = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The results for one test name. Exact names first ("HbA1c", or "Urine ›
 * Glucose"); otherwise a close name, kept to one test so "Glucose" never
 * mixes fasting and after-meal readings.
 */
function rowsFor(results, test) {
  const k = key(test);
  if (!k) return [];
  const exact = results.filter((r) => key(r.name) === k || key(`${r.section} ${r.name}`) === k);
  if (exact.length) return exact;
  if (k.length < 4) return [];
  const close = results.filter((r) => {
    const n = key(r.name);
    return n.length >= 4 && (n.includes(k) || k.includes(n));
  });
  if (!close.length) return [];
  // The name that turns up most, and only that one.
  const counts = new Map();
  for (const r of close) counts.set(key(r.name), (counts.get(key(r.name)) ?? 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  return close.filter((r) => key(r.name) === best);
}

/** The JSON a ```chart block holds, or null while it is still being written. */
export function parseChart(text) {
  try {
    const spec = JSON.parse(String(text).trim());
    return spec && typeof spec === 'object' ? spec : null;
  } catch {
    return null;
  }
}

/** Whether a result can be drawn on a range bar: a plain number and a numeric printed range. */
const onScale = (row) => Boolean(rangePosition(row.value, row.range));

/** One chart block. `citeFor(row)` is what a click on that reading opens, or null. */
export default function AnswerChart({ spec, results, onCite, citeFor }) {
  if (!spec || !results?.length) return null;
  if (spec.type === 'trend') {
    const rows = rowsFor(results, spec.test);
    const points = trendPoints(rows);
    if (points.length >= 2) return <TrendChart test={spec.test} points={points} onCite={onCite} citeFor={citeFor} />;
    // One reading is not a trend: show where it sits instead.
    return rows.length && onScale(rows[0]) ? <RangeChart rows={[rows[0]]} onCite={onCite} citeFor={citeFor} /> : null;
  }
  if (spec.type === 'range') {
    const tests = (Array.isArray(spec.tests) ? spec.tests : [spec.test]).filter(Boolean).slice(0, 4);
    // Results arrive newest first, so the first match is the latest reading.
    const rows = tests.map((t) => rowsFor(results, t)[0]).filter(Boolean);
    // A result without a numeric printed range has no bar to sit on.
    const unique = rows.filter((r, i) => rows.indexOf(r) === i && onScale(r));
    return unique.length ? <RangeChart rows={unique} onCite={onCite} citeFor={citeFor} /> : null;
  }
  return null;
}

function Frame({ icon: Icon, title, subtitle, children }) {
  return (
    <Box sx={{ my: 1.5, p: { xs: 1.5, sm: 2 }, border: '1px solid #e2e8f0', borderRadius: '12px', bgcolor: '#fff' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25 }}>
        <Box sx={{ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }}>
          <Icon sx={{ fontSize: 17 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 650, lineHeight: 1.3 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>{subtitle}</Typography>}
        </Box>
      </Stack>
      {children}
    </Box>
  );
}

/* ── trend ───────────────────────────────────────────────────────────── */

/** One numeric reading per report, oldest first. */
function trendPoints(rows) {
  const seen = new Set();
  const points = [];
  for (const r of rows) {
    const id = r.ref || `${r.dateISO}|${r.date}`;
    const y = readNumber(r.value);
    if (seen.has(id) || y === null) continue;
    seen.add(id);
    points.push({ ...r, y });
  }
  // Newest first from the server; reports without a readable date keep that order.
  return points.reverse().sort((a, b) => (a.dateISO && b.dateISO ? a.dateISO.localeCompare(b.dateISO) : 0));
}

/** The chart's width in pixels, so labels stay readable on a phone. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

const fmt = (n) => (Math.abs(n) >= 100 ? Math.round(n).toString() : Number(n.toFixed(1)).toString());

function TrendChart({ test, points, onCite, citeFor }) {
  const [ref, width] = useWidth();
  const latest = points[points.length - 1];
  const range = readRange(latest.range);
  const unit = latest.unit;

  const H = 200;
  const pad = { l: 40, r: 16, t: 26, b: 30 };
  const values = points.map((p) => p.y);
  const bounds = [...values, range?.lo, range?.hi].filter((v) => typeof v === 'number');
  let lo = Math.min(...bounds);
  let hi = Math.max(...bounds);
  if (lo === hi) { lo -= 1; hi += 1; }
  const span = hi - lo;
  lo -= span * 0.12;
  hi += span * 0.12;
  if (Math.min(...values) >= 0 && lo < 0) lo = 0;

  const W = Math.max(width, 260);
  const x = (i) => pad.l + (points.length === 1 ? 0.5 : i / (points.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  // Every label when they fit; otherwise every second or third.
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor((W - pad.l) / 70))));

  const band = range && {
    top: y(range.hi ?? hi),
    bottom: y(range.lo ?? lo),
  };

  return (
    <Frame
      icon={ShowChartRoundedIcon}
      title={`${latest.name}${unit ? ` (${unit})` : ''} over time`}
      subtitle={band ? `Green band: normal range on the latest report (${latest.range})` : `${points.length} readings`}
    >
      <Box ref={ref} sx={{ width: '100%' }}>
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-label={`${latest.name} over time: ${points.map((p) => `${p.value} on ${p.date}`).join(', ')}`} style={{ display: 'block', overflow: 'visible' }}>
            {band && (
              <rect x={pad.l} width={W - pad.l - pad.r} y={band.top} height={Math.max(0, band.bottom - band.top)} fill="rgba(22,163,74,0.10)" />
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef2f7" />
                <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#94a3b8">{fmt(t)}</text>
              </g>
            ))}
            <path d={path} fill="none" stroke="#2f7cf7" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => {
              const color = flagInfo(p.flag).color;
              const target = citeFor?.(p);
              return (
                <g
                  key={`${p.ref}-${i}`}
                  onClick={target ? () => onCite?.(target) : undefined}
                  style={{ cursor: target ? 'pointer' : 'default' }}
                >
                  <title>{`${p.value}${p.unit ? ` ${p.unit}` : ''} · ${p.date || 'no date'} · ${flagInfo(p.flag).label}`}</title>
                  <circle cx={x(i)} cy={y(p.y)} r="10" fill="transparent" />
                  <circle cx={x(i)} cy={y(p.y)} r="5.5" fill={color} stroke="#fff" strokeWidth="2" />
                  <text x={x(i)} y={y(p.y) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill={color}>{p.value}</text>
                  {(i % every === 0 || i === points.length - 1) && (
                    <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{p.date || '—'}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </Box>
    </Frame>
  );
}

/* ── range ───────────────────────────────────────────────────────────── */

function RangeChart({ rows, onCite, citeFor }) {
  return (
    <Frame icon={TuneRoundedIcon} title={rows.length === 1 ? rows[0].name : 'Your results against the normal range'} subtitle="Green: the report's normal range · dot: your result">
      <Stack spacing={1.75}>
        {rows.map((r) => <RangeRow key={`${r.ref}|${r.section}|${r.name}`} row={r} onCite={onCite} citeFor={citeFor} showName={rows.length > 1} />)}
      </Stack>
    </Frame>
  );
}

function RangeRow({ row, onCite, citeFor, showName }) {
  const info = flagInfo(row.flag);
  const position = rangePosition(row.value, row.range);
  const target = citeFor?.(row);
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.75 }}>
        {showName && <Typography variant="body2" sx={{ fontWeight: 650, flex: 1, minWidth: 0 }} noWrap>{row.name}</Typography>}
        <Box sx={{ flex: showName ? 'none' : 1 }}>
          <Tooltip title={target ? 'Open where it was read' : ''} arrow>
            <Typography
              component="span"
              onClick={target ? () => onCite?.(target) : undefined}
              sx={{ fontWeight: 700, color: info.color, cursor: target ? 'pointer' : 'default', fontSize: '0.95rem' }}
            >
              {row.value}{row.unit ? ` ${row.unit}` : ''}
            </Typography>
          </Tooltip>
        </Box>
        <Box component="span" sx={{ px: 1, py: '1px', borderRadius: 99, bgcolor: info.bg, color: info.color, fontWeight: 650, fontSize: 12, whiteSpace: 'nowrap' }}>
          {info.label}
        </Box>
      </Stack>
      {position ? (
        <Box sx={{ position: 'relative', height: 14 }}>
          <Box sx={{ position: 'absolute', left: 0, right: 0, top: 5, height: 5, borderRadius: 99, bgcolor: 'grey.100' }} />
          <Box sx={{ position: 'absolute', top: 5, height: 5, borderRadius: 99, left: `${position.band[0]}%`, width: `${position.band[1] - position.band[0]}%`, bgcolor: 'rgba(22,163,74,0.4)' }} />
          <Box
            sx={{
              position: 'absolute', top: 0, width: 15, height: 15, borderRadius: '50%',
              left: `calc(${position.at}% - 7.5px)`,
              bgcolor: info.color, border: '2px solid #fff', outline: '1px solid rgba(15,23,42,0.18)',
            }}
          />
        </Box>
      ) : null}
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }}>
        {[row.range ? `Normal: ${row.range}` : 'No range printed', row.date].filter(Boolean).join(' · ')}
      </Typography>
    </Box>
  );
}
