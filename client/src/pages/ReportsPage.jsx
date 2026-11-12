import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, Divider, IconButton, InputAdornment, ListItemIcon, Menu, MenuItem, Skeleton, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import * as api from '../api';
import ReportsTable, { groupByType, reportRows } from '../components/ReportsTable';
import { Card, CenteredNote, PageBody } from '../components/ui';
import { REPORT_TYPES, TYPE_IDS } from '../lib/reportTypes';
import usePageTitle from '../lib/usePageTitle';

/**
 * Every report of the profile in use, grouped under a small heading per kind
 * (Blood test, ECG, …) — an upload holding several reports shows each of
 * them, by its own title, under its own kind. Search and the filter sit on
 * one row above.
 */
export default function ReportsPage() {
  usePageTitle('Reports');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [uploads, setUploads] = useState(null);
  const [error, setError] = useState('');
  const [filterAnchor, setFilterAnchor] = useState(null);

  // Everything is loaded once and filtered here, so a search matches a
  // report's own title as well as its upload's.
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const load = async () => {
      try {
        const list = await api.listReports({ limit: 200 }, controller.signal);
        setUploads(list);
        setError('');
        // Refresh while anything is still being read.
        if (list.some((r) => r.status === 'analysing' || r.status === 'uploaded')) timer = setTimeout(load, 3000);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      }
    };
    load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const rows = useMemo(() => (uploads ? reportRows(uploads, { type, flagged, query }) : null), [uploads, type, flagged, query]);
  const activeFilters = (type ? 1 : 0) + (flagged ? 1 : 0);
  const clearAll = () => { setQuery(''); setType(''); setFlagged(false); };

  return (
    <PageBody>
      {/* Search and filter, one row */}
      <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search reports"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flex: 1, maxWidth: { md: 480 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff', height: 44 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
                </InputAdornment>
              ),
              endAdornment: query && (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setQuery('')} edge="end">
                    <CloseRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <Tooltip title="Filter">
          <IconButton
            onClick={(event) => setFilterAnchor(event.currentTarget)}
            aria-label={activeFilters ? `Filter, ${activeFilters} on` : 'Filter'}
            aria-haspopup="menu"
            sx={{
              width: 44, height: 44, flexShrink: 0, borderRadius: '10px',
              border: '1px solid', borderColor: activeFilters ? 'primary.main' : '#e2e8f0',
              bgcolor: activeFilters ? 'rgba(47,124,247,0.08)' : '#fff',
              color: activeFilters ? 'primary.main' : 'text.secondary',
            }}
          >
            <Badge badgeContent={activeFilters} color="primary" invisible={!activeFilters}>
              <TuneRoundedIcon />
            </Badge>
          </IconButton>
        </Tooltip>
      </Stack>

      <Menu
        anchorEl={filterAnchor}
        open={Boolean(filterAnchor)}
        onClose={() => setFilterAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 240, borderRadius: '12px', mt: 0.5 } } }}
      >
        <MenuItem onClick={() => setFlagged((on) => !on)} sx={{ py: 1 }}>
          <ListItemIcon><FlagRoundedIcon fontSize="small" sx={{ color: '#dc2626' }} /></ListItemIcon>
          <Typography variant="body2" sx={{ flex: 1 }}>Flagged only</Typography>
          <Switch size="small" checked={flagged} tabIndex={-1} />
        </MenuItem>
        <Divider />
        <Typography variant="caption" sx={{ px: 2, pt: 0.5, pb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
          Kind of report
        </Typography>
        {[{ id: '', label: 'All kinds' }, ...TYPE_IDS.map((id) => ({ id, ...REPORT_TYPES[id] }))].map((option) => {
          const Icon = option.icon;
          return (
            <MenuItem key={option.id || 'all'} selected={type === option.id} onClick={() => { setType(option.id); setFilterAnchor(null); }} sx={{ py: 0.9 }}>
              <ListItemIcon>{Icon && <Icon fontSize="small" sx={{ color: option.color }} />}</ListItemIcon>
              <Typography variant="body2" sx={{ flex: 1 }}>{option.label}</Typography>
              {type === option.id && <CheckRoundedIcon fontSize="small" sx={{ color: 'primary.main' }} />}
            </MenuItem>
          );
        })}
        {activeFilters > 0 && <Divider />}
        {activeFilters > 0 && (
          <MenuItem onClick={() => { setType(''); setFlagged(false); setFilterAnchor(null); }} sx={{ color: 'text.secondary' }}>
            <Typography variant="body2">Clear filters</Typography>
          </MenuItem>
        )}
      </Menu>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {rows && rows.length > 0 && (
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2, px: 0.5 }}>
          {rows.length} {rows.length === 1 ? 'report' : 'reports'}
        </Typography>
      )}

      {uploads && uploads.length === 0 ? (
        // Nothing uploaded yet for this profile.
        <CenteredNote icon={DescriptionOutlinedIcon} hint="Reports you upload will appear here." offset={60}>
          No reports yet
        </CenteredNote>
      ) : rows === null ? (
        <Card sx={{ overflow: 'hidden' }}>
          <Stack spacing={1} sx={{ p: 2.5 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={48} />)}
          </Stack>
        </Card>
      ) : rows.length === 0 ? (
        // A search or filter that matches nothing.
        <CenteredNote
          icon={SearchOffRoundedIcon}
          hint="Try another word, or clear the filters."
          offset={60}
          action={<Button size="small" onClick={clearAll} sx={{ color: 'text.secondary' }}>Clear search and filters</Button>}
        >
          No matching reports
        </CenteredNote>
      ) : (
        // One small grey heading per kind of report, its reports under it.
        <Stack spacing={2.5}>
          {groupByType(rows).map((group) => (
            <section key={group.id} aria-label={group.label}>
              <Typography
                component="h2"
                variant="caption"
                sx={{ display: 'block', mb: 0.75, px: 0.5, color: 'text.secondary', fontWeight: 600, fontSize: 12.5 }}
              >
                {group.label}
              </Typography>
              <Card sx={{ overflow: 'hidden' }}>
                <ReportsTable rows={group.rows} showKind={false} />
              </Card>
            </section>
          ))}
        </Stack>
      )}
    </PageBody>
  );
}
