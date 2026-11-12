import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Divider, Stack, Typography } from '@mui/material';
import * as api from '../api';
import { useAuth } from './AuthContext';

/*
 * "Continue with Google", drawn by Google's own Identity Services script.
 * The button hands back an ID token, which the server verifies; nothing else
 * from Google is stored. Shown only when the server has a client ID set and
 * the page is on one of the origins allowed for it in Google Cloud.
 */

const SCRIPT = 'https://accounts.google.com/gsi/client';
let scriptPromise = null;

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = resolve;
    tag.onerror = () => {
      scriptPromise = null;
      reject(new Error('Google sign-in could not load. Check the connection.'));
    };
    document.head.appendChild(tag);
  });
  return scriptPromise;
}

export default function GoogleButton({ onSignedIn, text = 'continue_with', showDivider = true }) {
  const { signInWithGoogle } = useAuth();
  const holderRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');

  // The callback changes identity each render; keep the latest in a ref.
  const onSignedInRef = useRef(onSignedIn);
  onSignedInRef.current = onSignedIn;

  useEffect(() => {
    let cancelled = false;
    setUnreachable(false);
    (async () => {
      const { googleClientId, reachable } = await api.fetchAuthConfig();
      if (cancelled) return;
      if (!reachable) {
        setUnreachable(true);
        return;
      }
      if (!googleClientId) {
        setAvailable(false);
        return;
      }
      try {
        await loadScript();
      } catch (err) {
        if (!cancelled) setError(err.message);
        return;
      }
      if (cancelled || !holderRef.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError('');
          try {
            const me = await signInWithGoogle(credential);
            onSignedInRef.current?.(me);
          } catch (err) {
            setError(err.message);
          }
        },
        ux_mode: 'popup',
        itp_support: true,
      });
      const width = Math.min(400, Math.max(220, holderRef.current.clientWidth || 320));
      window.google.accounts.id.renderButton(holderRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text,
        logo_alignment: 'left',
        width,
      });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [signInWithGoogle, text, attempt]);

  if (unreachable) {
    return (
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}
      >
        Cannot reach the MediThink server{api.API_BASE ? ` at ${api.API_BASE}` : ''}. Check that it is running, then try again.
      </Alert>
    );
  }

  if (!available) {
    return showDivider ? null : (
      <Alert severity="warning">Google sign-in is not set up on this server. Add GOOGLE_CLIENT_ID to server/.env and restart it.</Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Box ref={holderRef} sx={{ minHeight: 44, display: 'flex', justifyContent: 'center', opacity: ready ? 1 : 0.4 }} />
      {showDivider && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Divider sx={{ flex: 1 }} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>or use your email</Typography>
          <Divider sx={{ flex: 1 }} />
        </Stack>
      )}
    </Stack>
  );
}
