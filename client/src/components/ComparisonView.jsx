import { useState } from 'react';
import {
  Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Card } from './ui';
import EvidenceMarkdown from './EvidenceMarkdown';
import { typeInfo } from '../lib/reportTypes';
import { flagInfo, isOutOfRange } from '../lib/values';

const RANGE = {
  'now-in': { label: 'Now in range', color: '#16a34a', bg: 'rgba(22,163,74,0.09)' },
  'now-out': { label: 'Now out of range', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
  'still-out': { label: 'Still out of range', color: '#b45309', bg: 'rgba(217,119,6,0.10)' },
};

/**
 * Changes over time: one table per kind of report that appears more than
 * once in the upload. Every difference here was computed by the server from
 * the printed values; nothing on this screen is the model's arithmetic.
 */
export default function ComparisonView({ comparisons, onOpenValue }) {
  return (
    <Stack spacing={2.5}>
      {comparisons.map((comparison) => (
        <ComparisonCard key={comparison.category} comparison={comparison} onOpenValue={onOpenValue} />
      ))}
      <Typography variant="caption" sx={{ color: 'text.disabled', px: 0.5 }}>
        Differences are calculated by MediThink from the printed values, not by AI. Each value is judged against the range printed on its own report.
        No difference is shown when units differ or a value is not a single number.
      </Typography>
    </Stack>
  );
}

function ComparisonCard({ comparison, onOpenValue }) {
  const [showSingles, setShowSingles] = useState(false);
  const info = typeInfo(comparison.category);
  const Icon = info.icon;
  const docs = comparison.documents;
  const shared = comparison.rows.filter((r) => r.cells.filter(Boolean).length > 1);
  const singles = comparison.rows.filter((r) => r.cells.filter(Boolean).length < 2);

  return (
    <Card sx={{ overflow: 'hidden', borderRadius: '10px' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'grey.100' }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: `${info.color}14`, color: info.color }}>
          <Icon sx={{ fontSize: 19 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2">{info.label}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {docs.length} reports · {docs.map((d) => d.date || 'no date').join(' → ')}
          </Typography>
        </Box>
      </Stack>

      {comparison.narrative && (
        <Box sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'grey.100', bgcolor: 'rgba(47,124,247,0.03)' }}>
          <EvidenceMarkdown content={comparison.narrative} dense />
          <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.75 }}>
            Written from the table below — every figure in it was checked against the table.
          </Typography>
        </Box>
      )}

      {shared.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', px: 2.5, py: 3 }}>
          These reports have no test in common, so there is nothing to compare.
        </Typography>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& td, & th': { borderColor: 'grey.100' }, minWidth: 520 }}>
            <TableHead>
              <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12 } }}>
                <TableCell sx={{ pl: 2.5 }}>Test</TableCell>
                {docs.map((d) => (
                  <TableCell key={d.n} sx={{ whiteSpace: 'nowrap' }}>{d.date || `Report ${d.n}`}</TableCell>
                ))}
                <TableCell sx={{ pr: 2.5 }}>Change</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shared.map((row) => (
                <Row key={`${row.name}-${row.section}`} row={row} onOpenValue={onOpenValue} />
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      {singles.length > 0 && (
        <Box sx={{ borderTop: 1, borderColor: 'grey.100' }}>
          <Button
            size="small"
            onClick={() => setShowSingles((v) => !v)}
            endIcon={<ExpandMoreRoundedIcon sx={{ transform: showSingles ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />}
            sx={{ m: 1, ml: 1.5, color: 'text.secondary' }}
          >
            In one report only · {singles.length}
          </Button>
          {showSingles && (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ '& td': { borderColor: 'grey.100' }, minWidth: 520 }}>
                <TableBody>
                  {singles.map((row) => (
                    <Row key={`${row.name}-${row.section}`} row={row} onOpenValue={onOpenValue} />
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </Box>
      )}
    </Card>
  );
}

function Row({ row, onOpenValue }) {
  const latest = [...row.cells].reverse().find(Boolean);
  const otherNames = row.names.filter((n) => n !== row.name);
  return (
    <TableRow sx={{ '& td': { py: 1.1 } }}>
      <TableCell sx={{ pl: 2.5, maxWidth: 240 }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.name}</Typography>
          {row.matchedBy === 'meaning' && (
            <Tooltip arrow title={`Same test, named differently: ${row.names.join(' ↔ ')}. Matched by meaning — check if unsure.`}>
              <Box component="span" sx={{ color: 'primary.main', fontWeight: 700, cursor: 'help' }}>≈</Box>
            </Tooltip>
          )}
        </Stack>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
          {[otherNames.length > 0 && `also “${otherNames.join('”, “')}”`, latest?.range && `Ref ${latest.range}`].filter(Boolean).join(' · ')}
        </Typography>
      </TableCell>
      {row.cells.map((cell, i) => (
        <TableCell key={i} sx={{ whiteSpace: 'nowrap' }}>
          {cell ? <ValueCell cell={cell} name={row.name} onOpen={onOpenValue} /> : <Typography variant="body2" sx={{ color: 'text.disabled' }}>—</Typography>}
        </TableCell>
      ))}
      <TableCell sx={{ pr: 2.5, whiteSpace: 'nowrap' }}>
        <Change change={row.change} />
      </TableCell>
    </TableRow>
  );
}

function ValueCell({ cell, name, onOpen }) {
  const out = isOutOfRange(cell.flag);
  return (
    <Tooltip arrow title={`Show on the page${cell.range ? ` · Ref ${cell.range}` : ''}`}>
      <Box
        component="button"
        type="button"
        onClick={() => onOpen(cell, name)}
        sx={{
          border: 0, bgcolor: 'transparent', p: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left',
          display: 'inline-flex', alignItems: 'center', gap: 0.5,
          '&:hover .mt-v': { textDecoration: 'underline' },
        }}
      >
        <Box component="span" className="mt-v" sx={{ fontWeight: 650, fontSize: 14, color: out ? flagInfo(cell.flag).color : 'text.primary', fontFeatureSettings: '"tnum"' }}>
          {cell.value}
        </Box>
        {cell.unit && <Box component="span" sx={{ fontSize: 12, color: 'text.secondary' }}>{cell.unit}</Box>}
        {!cell.verified && <ErrorOutlineRoundedIcon sx={{ fontSize: 15, color: 'warning.main' }} />}
      </Box>
    </Tooltip>
  );
}

/** The computed difference, or a plain "—" that says why there is none. */
function Change({ change }) {
  const range = RANGE[change.range];
  let main;
  if (change.computed) {
    const sign = change.direction === 'up' ? '+' : '';
    const Arrow = change.direction === 'up' ? ArrowUpwardRoundedIcon : change.direction === 'down' ? ArrowDownwardRoundedIcon : null;
    main = change.direction === 'same' ? (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>No change</Typography>
    ) : (
      <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center' }}>
        {Arrow && <Arrow sx={{ fontSize: 15, color: '#475569' }} />}
        <Typography variant="body2" sx={{ fontWeight: 650, color: '#334155', fontFeatureSettings: '"tnum"' }}>
          {sign}{change.delta}
        </Typography>
        {change.percent !== null && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFeatureSettings: '"tnum"' }}>
            ({sign}{change.percent}%)
          </Typography>
        )}
      </Stack>
    );
  } else {
    main = (
      <Tooltip arrow title={change.reason}>
        <Typography variant="body2" sx={{ color: 'text.secondary', cursor: 'help', borderBottom: '1px dotted', borderColor: 'grey.400', display: 'inline' }}>
          {change.text ? (change.direction === 'same' ? 'Same' : 'Changed') : 'Not compared'}
        </Typography>
      </Tooltip>
    );
  }
  return (
    <Stack spacing={0.4} sx={{ alignItems: 'flex-start' }}>
      {main}
      {range && (
        <Box sx={{ px: 0.85, py: 0.1, borderRadius: 99, bgcolor: range.bg, color: range.color, fontSize: 11.5, fontWeight: 650 }}>
          {range.label}
        </Box>
      )}
    </Stack>
  );
}
