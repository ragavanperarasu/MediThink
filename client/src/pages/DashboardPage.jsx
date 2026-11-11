import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, Grid, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import ReportsTable from '../components/ReportsTable';
import { Card, CardHeader, EmptyState, IconTile, PageBody, PageHeader, StatCard } from '../components/ui';
import { greeting, plural } from '../lib/format';
import { REPORT_TYPES, TYPE_IDS } from '../lib/reportTypes';
import usePageTitle from '../lib/usePageTitle';

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      Promise.all([api.fetchStats(controller.signal), api.listReports({ limit: 6 }, controller.signal)])
        .then(([s, r]) => {
          setStats(s);
          setRecent(r);
          return s;
        })
        .catch((err) => {
          if (err.name !== 'AbortError') setError(err.message);
          return null;
        });

    // Keep the numbers moving while a report is still being read.
    let timer;
    const poll = async () => {
      const s = await load();
      if (s?.totals.analysing > 0 && !controller.signal.aborted) timer = setTimeout(poll, 4000);
    };
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const totals = stats?.totals;
  const loading = !stats && !error;

  return (
    <PageBody>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${user?.displayName?.split(' ')[0] || 'there'}`}
        subtitle="Here is what MediThink has read so far."
        actions={
          <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />}>
            New analysis
          </Button>
        }
      />

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={2.5} sx={{ mb: 2.5 }}>
        {[
          {
            icon: DescriptionOutlinedIcon,
            label: 'Reports analysed',
            value: totals?.ready,
            hint: totals ? `${plural(totals.reports, 'report')} uploaded` : '',
          },
          {
            icon: ScienceOutlinedIcon,
            label: 'Results read',
            value: totals?.values,
            hint: 'measured values extracted',
          },
          {
            icon: WarningAmberRoundedIcon,
            label: 'Out of range',
            value: totals?.flagged,
            hint: totals ? `across ${plural(totals.reportsWithFlags, 'report')}` : '',
            tone: '#dc2626',
          },
          {
            icon: ForumOutlinedIcon,
            label: 'Questions answered',
            value: totals?.questions,
            hint: 'with page citations',
            tone: '#4c4bec',
          },
        ].map((card) => (
          <Grid key={card.label} size={{ xs: 12, sm: 6, lg: 3 }}>
            {loading ? (
              <Skeleton variant="rounded" height={104} sx={{ borderRadius: 3.5 }} />
            ) : (
              <StatCard {...card} value={(card.value ?? 0).toLocaleString()} />
            )}
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card sx={{ height: '100%', overflow: 'hidden' }}>
            <CardHeader
              title="Recent reports"
              subtitle="The latest uploads, newest first"
              action={
                recent?.length > 0 && (
                  <Button component={RouterLink} to="/reports" size="small" endIcon={<ArrowForwardRoundedIcon />}>
                    View all
                  </Button>
                )
              }
            />
            {recent === null ? (
              <Stack spacing={1} sx={{ p: 2.5 }}>
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={44} />)}
              </Stack>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={DescriptionOutlinedIcon}
                title="No reports yet"
                body="Upload the JSON that SaatruAI produced for a medical report, and MediThink will read it."
                action={
                  <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />}>
                    Analyse your first report
                  </Button>
                }
              />
            ) : (
              <ReportsTable reports={recent} dense />
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5} sx={{ height: '100%' }}>
            <Card>
              <CardHeader title="Last 14 days" subtitle="Reports uploaded per day" />
              <Box sx={{ px: 2.5, pb: 2.5 }}>
                {stats ? <ActivityBars activity={stats.activity} /> : <Skeleton variant="rounded" height={96} />}
              </Box>
            </Card>
            <Card sx={{ flex: 1 }}>
              <CardHeader title="Report mix" subtitle="By kind of report" />
              <Box sx={{ px: 2.5, pb: 2.5 }}>
                {stats ? <TypeMix byType={stats.byType} total={totals.reports} /> : <Skeleton variant="rounded" height={140} />}
              </Box>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <HowItWorks />
    </PageBody>
  );
}

function ActivityBars({ activity }) {
  const max = Math.max(1, ...activity.map((d) => d.count));
  const total = activity.reduce((sum, d) => sum + d.count, 0);
  return (
    <Box>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-end', height: 88 }}>
        {activity.map((day, index) => {
          const label = new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
          const today = index === activity.length - 1;
          return (
            <Tooltip key={day.date} title={`${label}: ${plural(day.count, 'report')}`} arrow>
              <Box
                sx={{
                  flex: 1,
                  height: `${Math.max(6, (day.count / max) * 100)}%`,
                  borderRadius: 1.25,
                  background: day.count ? (today ? 'linear-gradient(180deg, #12b6fd, #4c4bec)' : 'linear-gradient(180deg, #5b9bfa, #2f7cf7)') : undefined,
                  bgcolor: day.count ? undefined : 'grey.100',
                  transition: 'opacity 150ms',
                  '&:hover': { opacity: 0.8 },
                }}
              />
            </Tooltip>
          );
        })}
      </Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>2 weeks ago</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{plural(total, 'report')}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>Today</Typography>
      </Stack>
    </Box>
  );
}

function TypeMix({ byType, total }) {
  if (!total) {
    return <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nothing to show yet.</Typography>;
  }
  return (
    <Stack spacing={1.5}>
      {TYPE_IDS.map((id) => {
        const info = REPORT_TYPES[id];
        const count = byType[id] ?? 0;
        const Icon = info.icon;
        return (
          <Box key={id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
              <Icon sx={{ fontSize: 16, color: info.color }} />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>{info.label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 650, fontFeatureSettings: '"tnum"' }}>{count}</Typography>
            </Stack>
            <Box sx={{ height: 6, borderRadius: 99, bgcolor: 'grey.100', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${(count / total) * 100}%`, bgcolor: info.color, borderRadius: 99, transition: 'width 400ms' }} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: DataObjectRoundedIcon,
      title: 'Extract in SaatruAI',
      body: 'Parse the report PDF in SaatruAI, then Download → JSON. That file carries the text, tables and where each sits on the page.',
    },
    {
      icon: FactCheckOutlinedIcon,
      title: 'Upload to MediThink',
      body: 'Drop in the JSON and the annotated PDF. One PDF holding several reports is split into separate documents, each read and checked on its own.',
    },
    {
      icon: InsightsOutlinedIcon,
      title: 'Read and ask',
      body: 'See what is out of range, read a plain-language summary, and ask questions — each answer pinned to the page.',
    },
  ];
  return (
    <Card sx={{ mt: 2.5, p: { xs: 2.5, md: 3 }, background: 'linear-gradient(120deg, #12b6fd0d, #2f7cf70d 45%, #4c4bec0d)' }}>
      <Typography variant="overline" sx={{ color: 'primary.main' }}>How MediThink works</Typography>
      <Grid container spacing={3} sx={{ mt: 0.5 }}>
        {steps.map((step, index) => (
          <Grid key={step.title} size={{ xs: 12, md: 4 }}>
            <Stack direction="row" spacing={2}>
              <IconTile icon={step.icon} bg="#fff" />
              <Box>
                <Typography variant="subtitle1">
                  <Box component="span" sx={{ color: 'primary.main', mr: 0.75 }}>{index + 1}.</Box>
                  {step.title}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{step.body}</Typography>
              </Box>
            </Stack>
          </Grid>
        ))}
      </Grid>
    </Card>
  );
}
