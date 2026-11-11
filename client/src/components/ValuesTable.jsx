import { Fragment, useMemo, useState } from 'react';
import {
  Box, InputAdornment, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { EmptyState } from './ui';
import { flagInfo, isOutOfRange } from '../lib/values';

/** Filters and search appear only once a list is long enough to need them. */
const TOOLS_FROM = 10;

/**
 * Every measured result, grouped as the report groups them. A row says only
 * what matters — the figure, its printed range, and a flag when it is
 * outside it. Selecting a row shows it on the page.
 */
export default function ValuesTable({ values, selectedKey, onSelect }) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('md'));
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => values.map((value, index) => ({ ...value, key: `v${index}` })), [values]);
  const counts = useMemo(
    () => ({
      all: rows.length,
      out: rows.filter((r) => isOutOfRange(r.flag)).length,
      unverified: rows.filter((r) => !r.verified).length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === 'out' && !isOutOfRange(row.flag)) return false;
      if (filter === 'unverified' && row.verified) return false;
      return !q || `${row.name} ${row.section} ${row.value}`.toLowerCase().includes(q);
    });
  }, [rows, filter, query]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const row of shown) {
      const section = row.section || 'Results';
      if (!map.has(section)) map.set(section, []);
      map.get(section).push(row);
    }
    return [...map.entries()];
  }, [shown]);

  if (values.length === 0) {
    return (
      <EmptyState
        icon={TableChartOutlinedIcon}
        title="No measured results"
        body="This document describes its findings in words. The Summary tab walks through them."
      />
    );
  }

  const tools = rows.length >= TOOLS_FROM || counts.out > 0 || counts.unverified > 0;

  return (
    <Stack sx={{ minHeight: 0 }}>
      {tools && (
        <Stack direction="row" spacing={1.5} sx={{ px: 2.5, py: 1.5, alignItems: 'center', borderBottom: 1, borderColor: 'grey.100' }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(_, value) => value && setFilter(value)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontWeight: 600, px: 1.25, py: 0.25, fontSize: 13, border: 0, borderRadius: '6px !important' } }}
          >
            <ToggleButton value="all">All {counts.all}</ToggleButton>
            {counts.out > 0 && <ToggleButton value="out">Flagged {counts.out}</ToggleButton>}
            {counts.unverified > 0 && <ToggleButton value="unverified">To check {counts.unverified}</ToggleButton>}
          </ToggleButtonGroup>
          <Box sx={{ flexGrow: 1 }} />
          {rows.length >= TOOLS_FROM && (
            <TextField
              size="small"
              placeholder="Find"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              sx={{ width: { xs: 130, sm: 180 } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          )}
        </Stack>
      )}

      {shown.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 5 }}>
          Nothing matches.
        </Typography>
      ) : compact ? (
        <Box sx={{ py: 0.5 }}>
          {groups.map(([section, items]) => (
            <Box key={section}>
              {groups.length > 1 && <SectionLabel sx={{ px: 2, pt: 1.5 }}>{section}</SectionLabel>}
              {items.map((row) => (
                <ValueCard key={row.key} row={row} selected={row.key === selectedKey} onSelect={onSelect} />
              ))}
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ '& td, & th': { borderColor: 'grey.100' } }}>
            <TableHead>
              <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600, fontSize: 12, bgcolor: 'transparent' } }}>
                <TableCell sx={{ pl: 2.5 }}>Test</TableCell>
                <TableCell>Result</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell sx={{ pr: 2.5, width: 110 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map(([section, items]) => (
                <Fragment key={section}>
                  {groups.length > 1 && (
                    <TableRow>
                      <TableCell colSpan={4} sx={{ pl: 2.5, pt: 2, pb: 0.5, borderBottom: 0 }}>
                        <SectionLabel>{section}</SectionLabel>
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((row) => {
                    const out = isOutOfRange(row.flag);
                    const selected = row.key === selectedKey;
                    return (
                      <TableRow
                        key={row.key}
                        hover
                        selected={selected}
                        onClick={() => onSelect(row)}
                        sx={{
                          cursor: 'pointer',
                          '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(47,124,247,0.07)' },
                          '& td': { py: 1.1 },
                        }}
                      >
                        <TableCell sx={{ pl: 2.5, fontWeight: 500, maxWidth: 280 }}>{row.name}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box component="span" sx={{ fontWeight: 650, color: out ? flagInfo(row.flag).color : 'text.primary', fontFeatureSettings: '"tnum"' }}>
                            {row.value}
                          </Box>
                          {row.unit && <Box component="span" sx={{ color: 'text.secondary', ml: 0.5, fontSize: 13 }}>{row.unit}</Box>}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{row.range || '—'}</TableCell>
                        <TableCell align="right" sx={{ pr: 2.5 }}>
                          <Marks row={row} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}

function SectionLabel({ children, sx }) {
  return (
    <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', fontWeight: 650, letterSpacing: '0.04em', textTransform: 'uppercase', ...sx }}>
      {children}
    </Typography>
  );
}

/** A flag only when out of range; a warning only when the figure was not found on the page. */
function Marks({ row }) {
  const out = isOutOfRange(row.flag);
  const info = flagInfo(row.flag);
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
      {!row.verified && (
        <Tooltip title="Not found exactly in the report text — check it on the page" arrow>
          <ErrorOutlineRoundedIcon sx={{ fontSize: 16, color: 'warning.main' }} />
        </Tooltip>
      )}
      {out && (
        <Box sx={{ px: 0.9, py: 0.15, borderRadius: 99, bgcolor: info.bg, color: info.color, fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap' }}>
          {info.label}
        </Box>
      )}
    </Stack>
  );
}

/** One result on one line — the phone layout, and the flagged list on the summary. */
export function ValueCard({ row, selected, onSelect }) {
  const out = isOutOfRange(row.flag);
  const info = flagInfo(row.flag);
  return (
    <Stack
      direction="row"
      spacing={1.5}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(row);
        }
      }}
      sx={{
        alignItems: 'center', px: 2, py: 1.25, cursor: 'pointer',
        bgcolor: selected ? 'rgba(47,124,247,0.07)' : 'transparent',
        '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'grey.100' },
        '&:hover': { bgcolor: selected ? 'rgba(47,124,247,0.07)' : 'grey.50' },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>{row.name}</Typography>
        {row.range && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>Ref {row.range}</Typography>
        )}
      </Box>
      <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 650, color: out ? info.color : 'text.primary', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
          {row.value}
          {row.unit && <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary', ml: 0.5, fontSize: 12 }}>{row.unit}</Box>}
        </Typography>
      </Box>
      <Marks row={row} />
    </Stack>
  );
}
