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
import { fonts, tokens } from '../theme';

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
  const mainProfile = profiles.find((p) => p.primary);
  const editingProfile = editing && editing !== 'new' ? editing : null;
  const editingCount = editingProfile ? list?.find((p) => p.id === editingProfile.id)?.reportCount ?? 0 : 0;

  return (
    <PageBody maxWidth={640}>
      <Stack spacing={2}>
        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

        {/* The person in use */}
        <Card sx={{ p: 2.5, background: tokens.gradientSoft }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
            <ProfileAvatar profile={profile} size={56} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" component="h1" noWrap>{profile.name}</Typography>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5, minWidth: 0 }}>
                {profile.primary && <MainAccountChip />}
                <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{profileLine(profile)}</Typography>
              </Stack>
            </Box>
            <Tooltip title="Edit profile">
              <IconButton onClick={() => setEditing(profile)} aria-label="Edit profile" sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0' }}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Card>

        {/* How many reports this profile holds — each report in an upload counts once. */}
        <Card component={RouterLink} to="/reports" sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.75, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: '#cbd5e1' } }}>
          <Box sx={{ width: 42, height: 42, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }}>
            <DescriptionOutlinedIcon />
          </Box>
          <Typography variant="body2" sx={{ flex: 1, color: 'text.secondary', fontWeight: 600 }}>Total reports</Typography>
          {totals ? (
            <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 26, lineHeight: 1 }}>
              {(totals.documents ?? totals.reports ?? 0).toLocaleString()}
            </Typography>
          ) : (
            <Skeleton width={36} height={32} />
          )}
        </Card>

        {/* Every profile under the account */}
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary', px: 0.5 }}>Profiles</Typography>
          <Card sx={{ overflow: 'hidden', mt: 0.5 }}>
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
                      '&:hover': { bgcolor: 'grey.50' },
                    }}
                  >
                    <ProfileAvatar profile={p} size={38} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{p.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
                        {[profileLine(p), plural(p.reportCount ?? 0, 'report')].join(' · ')}
                      </Typography>
                    </Box>
                    <Stack sx={{ alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                      {p.primary && <MainAccountChip />}
                      {current ? (
                        <Chip label="In use" size="small" sx={{ bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main', fontWeight: 600 }} />
                      ) : (
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>Switch</Typography>
                      )}
                    </Stack>
                  </ButtonBase>
                );
              })
            )}
            <ButtonBase
              onClick={() => setEditing('new')}
              sx={{ width: '100%', justifyContent: 'flex-start', gap: 1.75, px: 2, py: 1.5, color: 'primary.main', '&:hover': { bgcolor: 'grey.50' } }}
            >
              <Box sx={{ width: 38, height: 38, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(47,124,247,0.1)' }}>
                <AddRoundedIcon />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 650 }}>Add profile</Typography>
            </ButtonBase>
          </Card>
        </Box>


        {/* The account itself */}
        <Box>
          <Typography variant="overline" sx={{ color: 'text.secondary', px: 0.5 }}>Main account</Typography>
          <Card sx={{ p: 2, mt: 0.5 }}>
            <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
              <ProfileAvatar profile={mainProfile ?? { name: user.displayName, picture: user.picture }} size={40} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{user.displayName}</Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }} noWrap>{user.email || `@${user.username}`}</Typography>
              </Box>
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1.25 }}>
              {user.email ? 'Signed in with Google. ' : ''}Every profile above belongs to this account.
            </Typography>
          </Card>
        </Box>

        <Button
          variant="outlined"
          color="error"
          size="large"
          startIcon={<LogoutRoundedIcon />}
          onClick={handleSignOut}
          sx={{ borderRadius: '10px', bgcolor: '#fff' }}
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
function MainAccountChip() {
  return (
    <Chip
      label="Main account"
      size="small"
      sx={{ height: 22, fontSize: 11.5, fontWeight: 650, bgcolor: 'rgba(18,35,92,0.08)', color: '#12235c' }}
    />
  );
}
