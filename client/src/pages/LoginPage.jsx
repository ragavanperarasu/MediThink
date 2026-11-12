import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Stack, Typography } from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import GoogleButton from '../auth/GoogleButton';
import { MediThinkMark } from '../brand/Logo';
import usePageTitle from '../lib/usePageTitle';
import { fonts, tokens } from '../theme';

/** Only same-app paths are followed after sign-in — never an outside URL. */
const safeDestination = (path) =>
  typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && path !== '/login' ? path : '/dashboard';

/**
 * Sign in — with Google only; the first sign-in creates the account. Kept to
 * the essentials and centred, so it fits any screen without scrolling: on a
 * phone it fills the screen, on a tablet or desktop it sits in a card.
 */
export default function LoginPage() {
  usePageTitle('Sign in');
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const destination = safeDestination(location.state?.from);

  useEffect(() => {
    if (user) navigate(destination, { replace: true });
  }, [user, navigate, destination]);

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 'max(24px, env(safe-area-inset-top, 0px))',
        bgcolor: { xs: '#fff', sm: 'background.default' },
        backgroundImage: { sm: tokens.gradientSoft },
      }}
    >
      <Stack
        sx={{
          width: '100%',
          maxWidth: 400,
          alignItems: 'center',
          textAlign: 'center',
          p: { xs: 1, sm: 5 },
          bgcolor: '#fff',
          borderRadius: { sm: '20px' },
          border: { sm: '1px solid #e2e8f0' },
        }}
      >
        <Box
          sx={{
            width: 72, height: 72, borderRadius: '20px',
            display: 'grid', placeItems: 'center',
            bgcolor: '#fff', border: '1px solid #e2e8f0',
          }}
        >
          <MediThinkMark size={48} />
        </Box>

        <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 28, mt: 2.5, letterSpacing: '-0.01em' }}>
          MediThink
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, mb: 4 }}>
          Your family&apos;s medical reports, explained.
        </Typography>

        <Box sx={{ width: '100%' }}>
          <GoogleButton showDivider={false} onSignedIn={() => navigate(destination, { replace: true })} />
        </Box>

        <Typography variant="caption" sx={{ color: 'text.disabled', mt: 4, maxWidth: 300 }}>
          MediThink explains reports. It does not diagnose or replace a doctor.
        </Typography>
      </Stack>
    </Box>
  );
}
