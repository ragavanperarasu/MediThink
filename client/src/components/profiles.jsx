import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Avatar, Box, Button, ButtonBase, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, ListItemIcon, Menu, MenuItem, Stack, TextField, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import Logo from '../brand/Logo';
import { plural } from '../lib/format';

/*
 * Profiles: the people under one account. Each has their own reports; the
 * session uses one at a time.
 */

export const RELATIONS = [
  { id: 'self', label: 'Me' },
  { id: 'spouse', label: 'Spouse' },
  { id: 'child', label: 'Child' },
  { id: 'parent', label: 'Parent' },
  { id: 'sibling', label: 'Sibling' },
  { id: 'other', label: 'Other' },
];
export const relationLabel = (id) => RELATIONS.find((r) => r.id === id)?.label ?? 'Other';

const SEXES = [
  { id: '', label: 'Not given' },
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
];

export const PROFILE_COLORS = ['#2f7cf7', '#16a34a', '#d97706', '#db2777', '#7c3aed', '#0d9488', '#dc2626', '#475569'];

/** Whole years since a "YYYY-MM-DD" birth date, or null. */
export function ageFrom(dateOfBirth) {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

/** "Parent · 64 yrs · Female" — whatever is known. */
export function profileLine(profile) {
  const age = ageFrom(profile.dateOfBirth);
  return [
    relationLabel(profile.relation),
    age !== null && `${age} yr${age === 1 ? '' : 's'}`,
    profile.sex && SEXES.find((s) => s.id === profile.sex)?.label,
  ].filter(Boolean).join(' · ');
}

/**
 * The account holder's main profile shows their Google photo; every other
 * profile (and the main one, if the photo cannot load) shows its initial on
 * its colour.
 */
export function ProfileAvatar({ profile, size = 36, sx }) {
  const name = profile?.name || '?';
  return (
    <Avatar
      src={profile?.picture || undefined}
      alt={profile?.picture ? name : undefined}
      // Google's image host refuses some requests that carry a referrer.
      slotProps={{ img: { referrerPolicy: 'no-referrer' } }}
      sx={{
        width: size, height: size,
        fontSize: size * 0.42, fontWeight: 700,
        bgcolor: profile?.color || PROFILE_COLORS[0], color: '#fff',
        ...sx,
      }}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </Avatar>
  );
}

/**
 * Add a profile (no `profile`) or edit one. Deleting lives here too, behind a
 * confirmation that says how many reports go with it.
 */
export function ProfileDialog({ open, profile = null, reportCount = 0, canDelete = false, onClose, onSaved, onDeleted }) {
  const editing = Boolean(profile);
  const [fields, setFields] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFields({
      name: profile?.name ?? '',
      relation: profile?.relation ?? 'other',
      dateOfBirth: profile?.dateOfBirth ?? '',
      sex: profile?.sex ?? '',
      color: profile?.color ?? null,
    });
    setError('');
    setConfirmDelete(false);
  }, [open, profile]);

  if (!fields) return null;
  const set = (key) => (event) => setFields((f) => ({ ...f, [key]: event.target.value }));

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const body = { name: fields.name.trim(), relation: fields.relation, dateOfBirth: fields.dateOfBirth, sex: fields.sex };
      if (fields.color) body.color = fields.color;
      const saved = editing ? await api.updateProfile(profile.id, body) : await api.createProfile(body);
      onSaved?.(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteProfile(profile.id);
      onDeleted?.(profile);
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: '14px' } } }}>
      <Box component="form" onSubmit={save} noValidate>
        <DialogTitle sx={{ pb: 1 }}>{editing ? 'Edit profile' : 'Add a profile'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {!editing && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5 }}>
                A profile keeps one person&apos;s reports apart — a parent, a child, anyone you look after.
              </Typography>
            )}
            <TextField label="Name" value={fields.name} onChange={set('name')} required autoFocus fullWidth slotProps={{ htmlInput: { maxLength: 60 } }} />
            <TextField select label="Who is this?" value={fields.relation} onChange={set('relation')} fullWidth slotProps={{ select: { native: true } }}>
              {RELATIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </TextField>
            <Stack direction="row" spacing={1.5}>
              <TextField
                label="Date of birth"
                type="date"
                value={fields.dateOfBirth}
                onChange={set('dateOfBirth')}
                fullWidth
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              />
              <TextField select label="Sex" value={fields.sex} onChange={set('sex')} fullWidth slotProps={{ select: { native: true } }}>
                {SEXES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </TextField>
            </Stack>
            <Box>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Colour</Typography>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
                {PROFILE_COLORS.map((color) => {
                  const chosen = (fields.color ?? profile?.color) === color;
                  return (
                    <ButtonBase
                      key={color}
                      onClick={() => setFields((f) => ({ ...f, color }))}
                      aria-label={`Colour ${color}`}
                      aria-pressed={chosen}
                      sx={{
                        width: 30, height: 30, borderRadius: '50%', bgcolor: color, color: '#fff',
                        outline: chosen ? `2px solid ${color}` : 'none', outlineOffset: 2,
                      }}
                    >
                      {chosen && <CheckRoundedIcon sx={{ fontSize: 18 }} />}
                    </ButtonBase>
                  );
                })}
              </Stack>
            </Box>

            {editing && canDelete && (
              confirmDelete ? (
                <Alert
                  severity="error"
                  action={
                    <Stack direction="row" spacing={0.5}>
                      <Button color="inherit" size="small" onClick={() => setConfirmDelete(false)} disabled={busy}>Keep</Button>
                      <Button color="error" variant="contained" size="small" onClick={remove} disabled={busy}>Delete</Button>
                    </Stack>
                  }
                >
                  {reportCount
                    ? `Delete ${profile.name} and ${plural(reportCount, 'report')}? This cannot be undone.`
                    : `Delete ${profile.name}?`}
                </Alert>
              ) : (
                <Button color="error" onClick={() => setConfirmDelete(true)} sx={{ alignSelf: 'flex-start', px: 0 }}>
                  Delete this profile
                </Button>
              )
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !fields.name.trim()}
            startIcon={busy ? <CircularProgress size={15} color="inherit" /> : null}
          >
            {editing ? 'Save' : 'Add profile'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

/**
 * "Who's this for?" — shown after sign-in when the account has several
 * profiles and none is chosen yet.
 */
export function ProfilePicker() {
  const { profiles, chooseProfile, refresh, signOut, user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const choose = async (id) => {
    setBusyId(id);
    setError('');
    try {
      await chooseProfile(id);
    } catch (err) {
      setError(err.message);
      setBusyId(null);
    }
  };

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default', display: 'grid', placeItems: 'center', px: 2, py: 5 }}>
      <Stack spacing={4} sx={{ alignItems: 'center', width: '100%', maxWidth: 640 }}>
        <Logo size={30} />
        <Stack spacing={0.75} sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography variant="h3" component="h1">Who&apos;s this for?</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Choose whose reports to open.</Typography>
        </Stack>
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 2, width: '100%' }}>
          {profiles.map((p) => (
            <ButtonBase
              key={p.id}
              onClick={() => choose(p.id)}
              disabled={Boolean(busyId)}
              sx={{
                flexDirection: 'column', gap: 1.25, p: 2, borderRadius: '14px',
                bgcolor: '#fff', border: '1px solid #e2e8f0',
                '&:hover': { borderColor: p.color },
              }}
            >
              {busyId === p.id ? (
                <Box sx={{ width: 64, height: 64, display: 'grid', placeItems: 'center' }}><CircularProgress size={26} /></Box>
              ) : (
                <ProfileAvatar profile={p} size={64} />
              )}
              <Typography variant="body2" sx={{ fontWeight: 650, maxWidth: '100%' }} noWrap>{p.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', mt: -1 }}>{relationLabel(p.relation)}</Typography>
            </ButtonBase>
          ))}
          <ButtonBase
            onClick={() => setAdding(true)}
            disabled={Boolean(busyId)}
            sx={{ flexDirection: 'column', gap: 1.25, p: 2, borderRadius: '14px', border: '1px dashed #cbd5e1', color: 'text.secondary' }}
          >
            <Box sx={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'grey.100' }}>
              <AddRoundedIcon sx={{ fontSize: 30 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 650 }}>Add profile</Typography>
          </ButtonBase>
        </Box>
        <Button onClick={signOut} sx={{ color: 'text.secondary' }}>
          Not {user?.displayName}? Sign out
        </Button>
      </Stack>
      <ProfileDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={async () => {
          setAdding(false);
          await refresh();
        }}
      />
    </Box>
  );
}

/**
 * A menu to switch profile quickly. Opening another profile goes to its
 * dashboard, since the open page belongs to the profile being left — except
 * where the page means the same for any profile (`goHome={false}`, Upload).
 */
export function ProfileSwitcherMenu({ anchorEl, onClose, anchorOrigin, transformOrigin, goHome = true }) {
  const { profile, profiles, chooseProfile } = useAuth();
  const navigate = useNavigate();

  const choose = async (id) => {
    onClose();
    if (id === profile?.id) return;
    await chooseProfile(id);
    if (goHome) navigate('/dashboard');
  };

  return (
    <Menu
      anchorEl={anchorEl}
      open={Boolean(anchorEl)}
      onClose={onClose}
      anchorOrigin={anchorOrigin ?? { vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={transformOrigin ?? { vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { minWidth: 240, borderRadius: '12px', mt: 0.5 } } }}
    >
      <Typography variant="caption" sx={{ px: 2, pt: 0.5, pb: 1, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
        Switch profile
      </Typography>
      {profiles.map((p) => (
        <MenuItem key={p.id} onClick={() => choose(p.id)} selected={p.id === profile?.id} sx={{ gap: 1.5, py: 1 }}>
          <ProfileAvatar profile={p} size={28} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.name}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{relationLabel(p.relation)}</Typography>
          </Box>
          {p.id === profile?.id && <CheckRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />}
        </MenuItem>
      ))}
      <Divider />
      <MenuItem onClick={() => { onClose(); navigate('/profile'); }} sx={{ py: 1.1 }}>
        <ListItemIcon><ManageAccountsOutlinedIcon fontSize="small" /></ListItemIcon>
        <Typography variant="body2">Manage profiles</Typography>
      </MenuItem>
    </Menu>
  );
}
