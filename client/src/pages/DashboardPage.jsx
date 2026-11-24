import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Alert, Box, Button, ButtonBase, Grid, Stack, Typography } from '@mui/material';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import DailyCheckIn from '../components/DailyCheckIn';
import HealthCard from '../components/HealthCard';
import { ProfileAvatar, ProfileSwitcherMenu } from '../components/profiles';
import { Card, EmptyState, IconTile, PageBody } from '../components/ui';
import { greeting } from '../lib/format';
import usePageTitle from '../lib/usePageTitle';
import { APP_LAYOUT } from '../lib/layout';

export default function DashboardPage() {
  usePageTitle('Dashboard');
  // Commented out with the health snapshot below; uncomment both to bring it back.
  // const [stats, setStats] = useState(null);
  // const [error, setError] = useState('');
  // const [health, setHealth] = useState({ loading: true, data: null });
  //
  // useEffect(() => {
  //   const controller = new AbortController();
  //   // Built on the server the first time after reports change, which takes a
  //   // few seconds — so it loads on its own, without holding up the page.
  //   const loadHealth = () =>
  //     api.fetchHealthCard(controller.signal)
  //       .then((data) => setHealth({ loading: false, data }))
  //       .catch((err) => {
  //         if (err.name !== 'AbortError') setHealth({ loading: false, data: null });
  //       });
  //   loadHealth();
  //   let wasAnalysing = false;
  //   const load = () =>
  //     api.fetchStats(controller.signal)
  //       .then((s) => {
  //         setStats(s);
  //         return s;
  //       })
  //       .catch((err) => {
  //         if (err.name !== 'AbortError') setError(err.message);
  //         return null;
  //       });
  //
  //   // Keep the numbers moving while a report is still being read.
  //   let timer;
  //   const poll = async () => {
  //     const s = await load();
  //     const analysing = s?.totals.analysing > 0;
  //     // A report just finished: its findings belong on the health card.
  //     if (wasAnalysing && !analysing && !controller.signal.aborted) loadHealth();
  //     wasAnalysing = analysing;
  //     if (analysing && !controller.signal.aborted) timer = setTimeout(poll, 4000);
  //   };
  //   poll();
  //   return () => {
  //     controller.abort();
  //     clearTimeout(timer);
  //   };
  // }, []);
  //
  // const totals = stats?.totals;

  return (
    <PageBody>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between', mb: 3.5 }}
      >
        <Box sx={{ minWidth: 0, width: { xs: '100%', sm: 'auto' } }}>
          <ProfileGreeting />
        </Box>
        {/* Phones have the Upload tab in the bottom bar. */}
        <Button component={RouterLink} to="/reports/new" variant="contained" startIcon={<AddRoundedIcon />} sx={{ flexShrink: 0, [APP_LAYOUT]: { display: 'none' } }}>
          New analysis
        </Button>
      </Stack>

      {/* {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>} */}

      <DailyCheckIn />

      {/* Commented out for now: health snapshot, "No reports yet" and "How MediThink works".
      <HealthCard data={health.data} loading={health.loading} />

      {/ * Nothing uploaded yet: the one thing to do next. * /}
      {totals?.reports === 0 && (
        <Card>
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
        </Card>
      )}

      <Box sx={{ display: { xs: 'none', sm: 'block' } }}><HowItWorks /></Box>
      */}
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
          bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '14px',
          '&:hover': { borderColor: '#2563eb' },
        }}
      >
        <ProfileAvatar profile={profile} size={44} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ color: '#1d4ed8', fontWeight: 600, fontSize: 13, display: 'block', lineHeight: 1.3 }}>{greeting()}</Typography>
          {/* First name only — the full name is on the Profile page. */}
          <Typography component="h1" sx={{ fontWeight: 650, fontSize: 17, lineHeight: 1.35 }} noWrap>{profile.name.trim().split(/\s+/)[0]}</Typography>
        </Box>
        <Box
          aria-hidden
          sx={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            bgcolor: '#2563eb', color: '#fff',
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
