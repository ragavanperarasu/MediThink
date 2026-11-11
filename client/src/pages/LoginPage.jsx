import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Grid, IconButton,
  InputAdornment, Stack, TextField, Typography,
} from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import { useAuth } from '../auth/AuthContext';
import Logo from '../brand/Logo';
import { tokens } from '../theme';
import usePageTitle from '../lib/usePageTitle';

const REMEMBER_KEY = 'medithink.lastUsername';

/** Only same-app paths are followed after sign-in — never an outside URL. */
const safeDestination = (path) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && path !== '/login' ? path : '/dashboard';

export default function LoginPage() {
  usePageTitle('Sign in');
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [rememberedName] = useState(() => {
    try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; }
  });
  const [username, setUsername] = useState(rememberedName);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => {
    try { return Boolean(localStorage.getItem(REMEMBER_KEY)); } catch { return false; }
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const destination = safeDestination(location.state?.from);

  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [user, navigate, destination]);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await signIn(username.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* storage unavailable — not worth failing the sign-in over */ }
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Grid container sx={{ minHeight: '100vh', bgcolor: 'background.paper' }}>
      <Grid size={{ xs: 12, md: 6, lg: 5 }}>
        <Stack sx={{ minHeight: { xs: '100vh', md: '100vh' }, justifyContent: 'center', px: { xs: 3, sm: 6, lg: 9 }, py: 6 }}>
          <Box sx={{ width: '100%', maxWidth: 400, mx: 'auto' }}>
            <Box sx={{ mb: 5 }}><Logo size={36} tagline /></Box>

            <Stack spacing={1} sx={{ mb: 4 }}>
              <Typography variant="h3" component="h1">Welcome back</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Sign in with the administrator account to analyse medical reports.
              </Typography>
            </Stack>

            <Box component="form" onSubmit={submit} noValidate>
              <Stack spacing={2.5}>
                {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

                {/* A returning user lands on the password instead. */}
                <TextField
                  autoFocus={!rememberedName}
                  label="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  fullWidth
                  disabled={busy}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <PersonOutlineIcon sx={{ fontSize: 19, color: 'text.disabled' }} />
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <TextField
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  autoFocus={Boolean(rememberedName)}
                  required
                  fullWidth
                  disabled={busy}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <LockOutlinedIcon sx={{ fontSize: 19, color: 'text.disabled' }} />
                        </InputAdornment>
                      ),
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            onClick={() => setShowPassword((v) => !v)}
                            edge="end"
                            size="small"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <VisibilityOff sx={{ fontSize: 19 }} /> : <Visibility sx={{ fontSize: 19 }} />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />

                <FormControlLabel
                  sx={{ mt: -1 }}
                  control={<Checkbox size="small" checked={remember} onChange={(e) => setRemember(e.target.checked)} />}
                  label={<Typography variant="body2">Remember my username</Typography>}
                />

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={busy || !username.trim() || !password}
                  startIcon={busy ? <CircularProgress size={17} color="inherit" /> : null}
                >
                  {busy ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </Box>

            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 6 }}>
              MediThink explains what a report says. It does not diagnose or replace a doctor.
            </Typography>
          </Box>
        </Stack>
      </Grid>

      <BrandPanel />
    </Grid>
  );
}

/** The right half: what is behind the door. Hidden on phones. */
function BrandPanel() {
  const points = [
    { icon: <FactCheckOutlinedIcon />, title: 'Every value checked', body: 'Each result is matched against the report text and pinned to its line on the page.' },
    { icon: <MonitorHeartOutlinedIcon />, title: "Flags from the report's own ranges", body: 'High, low and abnormal results are read against the ranges the lab printed — never invented ones.' },
    { icon: <ForumOutlinedIcon />, title: 'Ask in plain language', body: 'Questions are answered from the report alone, with a citation for every figure.' },
  ];

  return (
    <Grid
      size={{ md: 6, lg: 7 }}
      sx={{ display: { xs: 'none', md: 'block' }, position: 'relative', overflow: 'hidden', background: tokens.gradient }}
    >
      <Box
        aria-hidden
        sx={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
          maskImage: 'radial-gradient(100% 70% at 70% 30%, #000, transparent)',
          WebkitMaskImage: 'radial-gradient(100% 70% at 70% 30%, #000, transparent)',
        }}
      />

      <Stack spacing={5} sx={{ position: 'relative', height: '100%', justifyContent: 'center', px: { md: 7, lg: 11 }, py: 8 }}>
        <Stack spacing={2.5}>
          <Typography variant="h2" sx={{ color: '#fff', maxWidth: 520 }}>
            Medical reports, read with evidence.
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.82)', maxWidth: 460, fontSize: '1.0625rem' }}>
            Bring the JSON that SaatruAI extracted from a report. MediThink flags what is out of range and points every answer back to the page.
          </Typography>
        </Stack>

        <PreviewCard />

        <Stack spacing={2.25} sx={{ maxWidth: 460 }}>
          {points.map((point) => (
            <Stack key={point.title} direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
              <Box
                sx={{
                  width: 38, height: 38, borderRadius: 2, flexShrink: 0,
                  display: 'grid', placeItems: 'center',
                  bgcolor: 'rgba(255,255,255,0.14)', border: 1, borderColor: 'rgba(255,255,255,0.2)',
                  color: '#fff', '& svg': { fontSize: 19 },
                }}
              >
                {point.icon}
              </Box>
              <Stack spacing={0.25}>
                <Typography variant="subtitle2" sx={{ color: '#fff' }}>{point.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)' }}>{point.body}</Typography>
              </Stack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Grid>
  );
}

/** An illustration of the product's core idea: a value, its flag, its page. */
function PreviewCard() {
  const rows = [
    { name: 'Haemoglobin', value: '10.2', unit: 'g/dL', flag: 'Low', color: '#d97706', at: 18 },
    { name: 'Total WBC count', value: '7,800', unit: '/µL', flag: 'In range', color: '#16a34a', at: 48 },
    { name: 'Fasting glucose', value: '132', unit: 'mg/dL', flag: 'High', color: '#dc2626', at: 84 },
  ];
  return (
    <Box
      aria-hidden
      sx={{
        maxWidth: 460, bgcolor: 'rgba(255,255,255,0.97)', borderRadius: 4, p: 2.25,
        boxShadow: '0 24px 60px rgba(12,20,60,0.28)',
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>Complete blood count</Typography>
        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>Illustration</Typography>
      </Stack>
      <Stack spacing={1.25}>
        {rows.map((row) => (
          <Stack key={row.name} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>{row.name}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700, color: row.flag === 'In range' ? 'text.primary' : row.color, width: 92, textAlign: 'right' }}>
              {row.value} <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: 12 }}>{row.unit}</Box>
            </Typography>
            <Box sx={{ position: 'relative', width: 70, height: 12, flexShrink: 0 }}>
              <Box sx={{ position: 'absolute', left: 0, right: 0, top: 4, height: 4, borderRadius: 99, bgcolor: 'grey.100' }} />
              <Box sx={{ position: 'absolute', left: '30%', width: '40%', top: 4, height: 4, borderRadius: 99, bgcolor: 'rgba(22,163,74,0.35)' }} />
              <Box sx={{ position: 'absolute', top: 0, left: `calc(${row.at}% - 6px)`, width: 12, height: 12, borderRadius: '50%', bgcolor: row.color, border: '2px solid #fff' }} />
            </Box>
            <Box sx={{ px: 1, py: 0.25, borderRadius: 1.5, fontSize: 11, fontWeight: 650, color: row.color, bgcolor: `${row.color}14`, width: 62, textAlign: 'center' }}>
              {row.flag}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
