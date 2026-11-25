import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Alert, Box, Button, ButtonBase, Chip, IconButton, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import { ProfileAvatar, ProfileDialog, profileLine } from '../components/profiles';
import { Card, PageBody } from '../components/ui';
import { plural } from '../lib/format';
import usePageTitle from '../lib/usePageTitle';
import { fonts } from '../theme';

/*
 * One accent colour, kept for what matters: the person in use, and what can
 * be tapped. Everything else stays white and grey; red only for signing out.
 */
const C = {
  blue: { main: '#2563eb', dark: '#1d4ed8', tint: '#eff6ff', line: '#bfdbfe' },
  plain: { main: '#1d4ed8', tint: '#fff', line: '#e2e8f0' },
  red: { main: '#b91c1c', tint: '#fff', line: '#fecaca' },
};

/** A section heading in its section's colour. */
const SectionTitle = ({ color, children }) => (
  <Typography variant="overline" component="h2" sx={{ color, px: 0.5, fontSize: 12, display: 'block' }}>{children}</Typography>
);

/**
 * The person in use, the account's other profiles (tap to switch, or add
 * one), how many reports the person in use has, and the account itself.
 */
export default function ProfilePage() {
  usePageTitle('Profile');
  const { user, profile, profiles, refresh, chooseProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [totals, setTotals] = useState(null);
  const [list, setList] = useState(null);
  const [editing, setEditing] = useState(null); // a profile, 'new', or null
  const [error, setError] = useState('');

  const loadList = useCallback(() => api.listProfiles().then((r) => setList(r.profiles)).catch((err) => setError(err.message)), []);

  useEffect(() => {
    const controller = new AbortController();
    api.fetchStats(controller.signal).then((s) => setTotals(s.totals)).catch(() => {});
    loadList();
    return () => controller.abort();
  }, [loadList]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const switchTo = async (id) => {
    if (id === profile?.id) return;
    try {
      await chooseProfile(id);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user || !profile) return null;
  const editingProfile = editing && editing !== 'new' ? editing : null;
  const editingCount = editingProfile ? list?.find((p) => p.id === editingProfile.id)?.reportCount ?? 0 : 0;

  return (
    <PageBody maxWidth={640}>
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {/* The person in use */}
        <Card sx={{ p: 2.5, bgcolor: C.blue.main, borderColor: C.blue.main, color: '#fff' }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <Box sx={{ p: '3px', borderRadius: '50%', bgcolor: '#fff', flexShrink: 0 }}>
              <ProfileAvatar profile={profile} size={56} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" component="h1" sx={{ fontSize: 20 }} noWrap>{profile.name}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, minWidth: 0 }}>
                {profile.primary && <MainAccountChip onColor />}
                <Typography sx={{ fontSize: 14.5, color: '#fff', opacity: 0.95 }} noWrap>{profileLine(profile)}</Typography>
              </Stack>
            </Box>
            <Tooltip title="Edit profile">
              <IconButton onClick={() => setEditing(profile)} aria-label="Edit profile" sx={{ width: 44, height: 44, bgcolor: '#fff', color: C.blue.dark, '&:hover': { bgcolor: C.blue.tint } }}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Card>

        {/* How many reports this profile holds — each report in an upload counts once. */}
        <Card component={RouterLink} to="/reports" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.75, textDecoration: 'none', color: 'inherit', bgcolor: C.plain.tint, borderColor: C.plain.line, '&:hover': { borderColor: C.plain.main } }}>
          <Box sx={{ width: 44, height: 44, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: C.plain.main, color: '#fff' }}>
            <DescriptionOutlinedIcon />
          </Box>
          <Typography sx={{ flex: 1, color: C.plain.main, fontWeight: 650, fontSize: 15 }}>Total reports</Typography>
          {totals ? (
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 28, lineHeight: 1, color: C.plain.main }}>
              {(totals.documents ?? totals.reports ?? 0).toLocaleString()}
            </Typography>
          ) : (
            <Skeleton width={36} height={32} />
          )}
        </Card>

        {/* Every profile under the account */}
        <Box>
          <SectionTitle color="text.secondary">Profiles</SectionTitle>
          <Card sx={{ overflow: 'hidden', mt: 0.5, borderColor: C.plain.line }}>
            {list === null ? (
              <Stack spacing={1} sx={{ p: 2 }}>{[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={44} />)}</Stack>
            ) : (
              list.map((p) => {
                const current = p.id === profile.id;
                return (
                  <ButtonBase
                    key={p.id}
                    onClick={() => (current ? setEditing(p) : switchTo(p.id))}
                    sx={{
                      width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.75, px: 2, py: 1.5,
                      borderBottom: '1px solid', borderColor: 'grey.100',
                      // The one in use: a blue bar and tint.
                      borderLeft: `4px solid ${current ? C.blue.main : 'transparent'}`,
                      bgcolor: current ? C.blue.tint : '#fff',
                      '&:hover': { bgcolor: C.blue.tint },
                    }}
                  >
                    <ProfileAvatar profile={p} size={38} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 650, fontSize: 15 }} noWrap>{p.name}</Typography>
                      <Typography variant="body2" sx={{ color: '#475569', display: 'block', fontSize: 13 }} noWrap>
                        {[profileLine(p), plural(p.reportCount ?? 0, 'report')].join(' · ')}
                      </Typography>
                    </Box>
                    <Stack sx={{ alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                      {p.primary && <MainAccountChip />}
                      {current ? (
                        <Chip label="In use" size="small" sx={{ height: 24, fontSize: 12.5, bgcolor: C.blue.main, color: '#fff', fontWeight: 650 }} />
                      ) : (
                        <Typography sx={{ color: C.blue.main, fontWeight: 650, fontSize: 13.5 }}>Switch</Typography>
                      )}
                    </Stack>
                  </ButtonBase>
                );
              })
            )}
            <ButtonBase
              onClick={() => setEditing('new')}
              sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.75, px: 2, py: 1.5, borderLeft: '4px solid transparent', color: C.blue.main, '&:hover': { bgcolor: C.blue.tint } }}
            >
              <Box sx={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: C.blue.main, color: '#fff' }}>
                <AddRoundedIcon />
              </Box>
              <Typography sx={{ fontWeight: 650, fontSize: 15 }}>Add profile</Typography>
            </ButtonBase>
          </Card>
        </Box>


        <Button
          variant="outlined"
          color="error"
          size="large"
          startIcon={<LogoutRoundedIcon />}
          onClick={handleSignOut}
          sx={{ borderRadius: '10px', minHeight: 48, color: C.red.main, bgcolor: C.red.tint, borderColor: C.red.line, '&:hover': { borderColor: C.red.main, bgcolor: '#fef2f2' } }}
        >
          Sign out
        </Button>
      </Stack>

      <ProfileDialog
        open={Boolean(editing)}
        profile={editingProfile}
        reportCount={editingCount}
        // The account's own profile stays with the account.
        canDelete={(list?.length ?? 0) > 1 && !editingProfile?.primary}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await Promise.all([refresh(), loadList()]);
        }}
        onDeleted={async () => {
          setEditing(null);
          // Deleting the profile in use leaves none chosen; the picker then asks.
          await Promise.all([refresh(), loadList()]);
        }}
      />
    </PageBody>
  );
}

/** Marks the account holder's own profile — the one the account was made with. */
function MainAccountChip({ onColor = false }) {
  return (
    <Chip
      label="Main account"
      size="small"
      sx={{
        height: 24, fontSize: 12.5, fontWeight: 650,
        ...(onColor ? { bgcolor: '#fff', color: C.blue.dark } : { bgcolor: '#f1f5f9', color: '#334155' }),
      }}
    />
  );
}
