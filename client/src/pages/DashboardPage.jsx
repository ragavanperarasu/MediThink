import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, ButtonBase, Grid, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import ReportsTable, { reportRows } from '../components/ReportsTable';
import { ProfileAvatar, ProfileSwitcherMenu } from '../components/profiles';
import { Card, CardHeader, EmptyState, IconTile, PageBody, StatCard } from '../components/ui';
import { greeting, plural } from '../lib/format';
import { REPORT_TYPES, TYPE_IDS } from '../lib/reportTypes';
import usePageTitle from '../lib/usePageTitle';
import { APP_LAYOUT } from '../lib/layout';

export default function DashboardPage() {
  usePageTitle('Dashboard');
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between', mb: 3.5 }}
      >
        <Box sx={{ minWidth: 0, width: { xs: '100%', sm: 'auto' } }}>
          <ProfileGreeting />
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.25 }}>Here is what MediThink has read so far.</Typography>
        </Box>
        {/* Phones have the Upload tab in the bottom bar. */}
        <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />} sx={{ flexShrink: 0, [APP_LAYOUT]: { display: 'none' } }}>
          New analysis
        </Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={{ xs: 1.5, sm: 2.5 }} sx={{ mb: 2.5 }}>
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
          <Grid key={card.label} size={{ xs: 6, lg: 3 }}>
            {loading ? (
              <Skeleton variant="rounded" height={104} sx={{ borderRadius: '10px' }} />
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
                body="Upload a report PDF and MediThink will read it, flag what is out of range, and explain it."
                action={
                  <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />}>
                    Analyse your first report
                  </Button>
                }
              />
            ) : (
              <ReportsTable rows={reportRows(recent).slice(0, 6)} dense />
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

      <Box sx={{ display: { xs: 'none', sm: 'block' } }}><HowItWorks /></Box>
    </PageBody>
  );
}

/**
 * A small card: the profile's photo or initial, "Good evening" and its name —
 * whose reports these are — with a switch button. Tap it to change profile.
 */
function ProfileGreeting() {
  const { profile } = useAuth();
  const [anchor, setAnchor] = useState(null);
  if (!profile) return null;
  return (
    <>
      {/* A card: whose reports these are, with a switch button. */}
      <ButtonBase
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`Showing ${profile.name}'s reports. Switch profile`}
        aria-haspopup="menu"
        sx={{
          width: { xs: '100%', sm: 400 },
          gap: 1.75, justifyContent: 'flex-start', textAlign: 'left',
          px: 1.75, py: 1.5,
          bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
          '&:hover': { borderColor: '#cbd5e1' },
        }}
      >
        <ProfileAvatar profile={profile} size={44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>{greeting()}</Typography>
          {/* First name only — the full name is on the Profile page. */}
          <Typography component="h1" sx={{ fontWeight: 650, fontSize: 17, lineHeight: 1.35 }} noWrap>{profile.name.trim().split(/\s+/)[0]}</Typography>
        </Box>
        <Box
          aria-hidden
          sx={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main',
          }}
        >
          <SwapHorizRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
      </ButtonBase>
      <ProfileSwitcherMenu
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      />
    </>
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
      icon: PictureAsPdfOutlinedIcon,
      title: 'Upload the PDF',
      body: 'Add a report PDF — a scan is fine. LandingAI reads every page into text and tables, each with its place on the page.',
    },
    {
      icon: FactCheckOutlinedIcon,
      title: 'Split and checked',
      body: 'One PDF holding several reports is split into separate documents, each read and checked on its own.',
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
