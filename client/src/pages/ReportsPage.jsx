import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert, Button, Chip, InputAdornment, MenuItem, Skeleton, Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import * as api from '../api';
import ReportsTable from '../components/ReportsTable';
import { Card, EmptyState, PageBody } from '../components/ui';
import { REPORT_TYPES, TYPE_IDS } from '../lib/reportTypes';
import usePageTitle from '../lib/usePageTitle';

export default function ReportsPage() {
  usePageTitle('Reports');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [type, setType] = useState('');
  const [flagged, setFlagged] = useState(false);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    const load = async () => {
      try {
        const list = await api.listReports(
          { q: debounced, type, flagged: flagged ? '1' : '', limit: 200 },
          controller.signal,
        );
        setReports(list);
        setError('');
        // Refresh while anything in view is still being read.
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
  }, [debounced, type, flagged]);

  const filtering = Boolean(debounced || type || flagged);

  return (
    <PageBody>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 3 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', flex: 1, minWidth: 0 }}>
          <Typography variant="h3" component="h1">Reports</Typography>
          {reports && (
            <Typography variant="body2" sx={{ color: 'text.disabled', fontWeight: 600 }}>{reports.length}</Typography>
          )}
        </Stack>
        <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />}>
          New
        </Button>
      </Stack>

      <Stack direction="row" sx={{ mb: 2, gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flex: { xs: '1 1 100%', sm: '0 1 280px' }, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 19, color: 'text.disabled' }} />
                </InputAdornment>
              ),
            },
          }}
        />
        <TextField
          select
          size="small"
          value={type}
          onChange={(event) => setType(event.target.value)}
          sx={{ minWidth: 150, '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">All types</MenuItem>
          {TYPE_IDS.map((id) => {
            const Icon = REPORT_TYPES[id].icon;
            return (
              <MenuItem key={id} value={id}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Icon sx={{ fontSize: 17, color: REPORT_TYPES[id].color }} />
                  <span>{REPORT_TYPES[id].label}</span>
                </Stack>
              </MenuItem>
            );
          })}
        </TextField>
        <Chip
          icon={<FlagRoundedIcon />}
          label="Flagged"
          onClick={() => setFlagged((on) => !on)}
          variant={flagged ? 'filled' : 'outlined'}
          sx={{
            height: 40, borderRadius: 2.5, px: 0.5, fontWeight: 600,
            ...(flagged
              ? { bgcolor: '#dc2626', color: '#fff', '& .MuiChip-icon': { color: '#fff' }, '&:hover': { bgcolor: '#b91c1c' } }
              : { bgcolor: '#fff', '& .MuiChip-icon': { color: '#dc2626' } }),
          }}
        />
        {filtering && (
          <Button size="small" onClick={() => { setQuery(''); setType(''); setFlagged(false); }} sx={{ color: 'text.secondary' }}>
            Clear
          </Button>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ overflow: 'hidden', borderRadius: '10px' }}>
        {reports === null ? (
          <Stack spacing={1} sx={{ p: 2.5 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={48} />)}
          </Stack>
        ) : reports.length === 0 ? (
          <EmptyState
            icon={FolderOpenOutlinedIcon}
            title={filtering ? 'Nothing found' : 'No reports yet'}
            body={filtering ? 'Try another search.' : 'Upload a report to get started.'}
            action={
              filtering ? (
                <Button onClick={() => { setQuery(''); setType(''); setFlagged(false); }}>Clear filters</Button>
              ) : (
                <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />}>
                  New analysis
                </Button>
              )
            }
          />
        ) : (
          <ReportsTable reports={reports} />
        )}
      </Card>
    </PageBody>
  );
}
