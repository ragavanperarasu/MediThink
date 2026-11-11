import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { useAuth } from './AuthContext';

/** Holds while the session is checked, then sends visitors to sign in. */
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <SessionLoading />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return children;
}

export function SessionLoading({ label = 'Checking your session…' }) {
  return (
    <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <CircularProgress size={26} />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{label}</Typography>
      </Stack>
    </Box>
  );
}
