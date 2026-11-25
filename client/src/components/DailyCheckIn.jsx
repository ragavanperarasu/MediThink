import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Dialog, DialogContent, IconButton, LinearProgress, Skeleton, Stack,
  ToggleButton, ToggleButtonGroup, Typography, useMediaQuery,
} from '@mui/material';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import RecordVoiceOverOutlinedIcon from '@mui/icons-material/RecordVoiceOverOutlined';
import MedicalServicesOutlinedIcon from '@mui/icons-material/MedicalServicesOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import Menu from '@mui/material/Menu';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import { APP_LAYOUT_QUERY } from '../lib/layout';
import { languageByCode, saveLanguage, savedLanguage } from '../lib/languages';
import { canLive } from '../lib/live';
import { fonts } from '../theme';
import { Card, IconTile } from './ui';
import LanguageList from './LanguageList';
import VoiceMode from './VoiceMode';

/*
 * The home page's daily check-in: a two-minute voice chat (GPT-Live) about
 * how the person is today, a few simple questions guided by their reports.
 * The notes written from it are shown day by day, and gathered into a short
 * note to take to the next doctor visit.
 */

/** One solid brand blue for what needs attention, a light tint behind the rest. */
const BLUE = '#2563eb';
/** The header icon's size; the subtitle lines up with the title beside it. */
const ICON = 40;
const BLUE_DARK = '#1d4ed8';
const TINT = '#eff6ff';

/** Readable as white text on the colour, and on their own 8% tint (WCAG AA). */
const FEELING = {
  good: { label: 'Feeling good', color: '#15803d' },
  okay: { label: 'Feeling okay', color: '#b45309' },
  unwell: { label: 'Not feeling well', color: '#b91c1c' },
  '': { label: 'Checked in', color: '#475569' },
};

const STATUS_TEXT = {
  idle: 'Tap the circle to start',
  connecting: 'Getting ready…',
  listening: 'Listening — just talk',
  speaking: 'Speaking — talk any time',
  muted: 'Muted — tap the circle to talk',
};

/** "YYYY-MM-DD" in this browser's time. */
const dayKey = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const fromKey = (key) => new Date(`${key}T12:00:00`);
const longDay = (key) => fromKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

export default function DailyCheckIn() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [talking, setTalking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  // The same language as the Assistant's answers, chosen here or there.
  const [language, setLanguage] = useState(() => savedLanguage(profile?.id));
  const [languageAnchor, setLanguageAnchor] = useState(null);
  useEffect(() => setLanguage(savedLanguage(profile?.id)), [profile?.id]);
  const chooseLanguage = (code) => {
    setLanguage(code);
    saveLanguage(profile?.id, code);
    setLanguageAnchor(null);
  };

  const load = useCallback((signal) => api.fetchCheckins(signal)
    .then((d) => {
      setData(d);
      setError('');
    })
    .catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    }), []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, profile?.id]);

  const connect = useCallback((lang, sdp, signal) => api.startCheckinLive(lang, sdp, signal), []);

  /** The chat ended: its words become today's notes. */
  const finish = useCallback((turns) => {
    if (!turns.some((t) => t.role === 'user')) return;
    setSaving(true);
    api.saveCheckin(language, turns)
      .then(({ checkin }) => {
        if (checkin) setData((d) => (d ? { ...d, today: checkin } : d));
      })
      .catch((err) => setError(`Your check-in could not be saved: ${err.message}`))
      .finally(() => setSaving(false));
  }, [language]);

  // Every check-in kept, newest first: today's, then the last two weeks'.
  const checkins = useMemo(() => [...(data?.today ? [data.today] : []), ...(data?.recent ?? [])], [data]);

  if (!data && !error) return <Skeleton variant="rounded" height={190} sx={{ borderRadius: '14px', mb: 2.5 }} />;

  const done = data?.today;
  const hasNotes = checkins.length > 0;
  const available = canLive && data?.live !== false;
  const lang = languageByCode(language);

  const remove = async (checkin) => {
    if (!window.confirm(`Delete the notes for ${longDay(checkin.day)}?`)) return;
    try {
      await api.deleteCheckin(checkin.id);
      setData((d) => ({
        ...d,
        today: d.today?.id === checkin.id ? null : d.today,
        recent: d.recent.filter((c) => c.id !== checkin.id),
      }));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card component="section" aria-labelledby="checkin-title" sx={{ mb: 2.5, borderRadius: '14px', overflow: 'hidden', borderColor: '#bfdbfe' }}>
      {saving && <LinearProgress aria-label="Writing your notes" />}
      {/* The title on solid blue: the one thing on this page to do every day */}
      <Box sx={{ bgcolor: BLUE, color: '#fff', px: { xs: 2, sm: 2.5 }, py: { xs: 2, sm: 2.25 } }}>
        {/* One line: icon, title, language — all centred on it */}
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
          <IconTile icon={RecordVoiceOverOutlinedIcon} size={ICON} color={BLUE} bg="#fff" />
          <Typography
            id="checkin-title"
            component="h2"
            noWrap
            sx={{ flex: 1, minWidth: 0, fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 18, sm: 19 }, lineHeight: 1.2 }}
          >
            Daily check-in
          </Typography>
          <ButtonBase
            onClick={(event) => setLanguageAnchor(event.currentTarget)}
            aria-label={`Language: ${lang.name}. Change`}
            aria-haspopup="menu"
            sx={{
              flexShrink: 0, height: 40, pl: 1.25, pr: 0.75, gap: 0.5, borderRadius: 99,
              bgcolor: '#fff', color: BLUE_DARK, '&:hover': { bgcolor: TINT },
            }}
          >
            <TranslateRoundedIcon sx={{ fontSize: 18 }} />
            <Box component="span" lang={lang.code} sx={{ fontWeight: 650, fontSize: 14, lineHeight: 1 }}>{lang.native}</Box>
            <ExpandMoreRoundedIcon sx={{ fontSize: 20 }} />
          </ButtonBase>
        </Stack>
        {/* Under the title text, not under the icon */}
        <Typography sx={{ fontSize: 14.5, lineHeight: 1.45, color: '#fff', mt: 0.75, pl: `${ICON + 12}px` }}>
          {saving
            ? 'Writing your notes…'
            : done
              ? 'Done for today.'
              : 'How are you today? A short voice chat.'}
        </Typography>
        <Menu
          anchorEl={languageAnchor}
          open={Boolean(languageAnchor)}
          onClose={() => setLanguageAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{ paper: { sx: { width: 260, maxHeight: 460, borderRadius: '10px', mt: 0.5 } } }}
        >
          <LanguageList value={language} onChoose={chooseLanguage} />
        </Menu>
      </Box>

      {/* What to do: talk, or open the notes for the doctor */}
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: { xs: 2, sm: 2.25 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
          <Button
            variant={done ? 'outlined' : 'contained'}
            startIcon={<MicRoundedIcon />}
            onClick={() => { setError(''); setTalking(true); }}
            disabled={!available || saving}
            sx={{
              minHeight: 48, fontSize: 15, px: 3,
              ...(done
                ? { color: BLUE_DARK, borderColor: BLUE, '&:hover': { borderColor: BLUE_DARK, bgcolor: TINT } }
                : { bgcolor: BLUE, '&:hover': { bgcolor: BLUE_DARK } }),
            }}
          >
            {done ? "Update today's check-in" : 'Start check-in'}
          </Button>
          {hasNotes && (
            <Button
              variant="outlined"
              startIcon={<MedicalServicesOutlinedIcon />}
              onClick={() => setDoctorOpen(true)}
              sx={{ minHeight: 48, fontSize: 15, px: 3, color: BLUE_DARK, borderColor: '#bfdbfe', '&:hover': { borderColor: BLUE, bgcolor: TINT } }}
            >
              For your doctor
            </Button>
          )}
        </Stack>

        {!available && data && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {canLive ? 'Voice check-in is not set up on the server yet.' : 'This browser cannot do voice chats. Try Chrome, Edge or Safari.'}
          </Typography>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>{error}</Alert>}
      </Box>

      <VoiceMode
        open={talking}
        onClose={() => setTalking(false)}
        label="Daily check-in"
        language={language}
        connect={connect}
        onFinish={finish}
        statusText={STATUS_TEXT}
      />
      <DoctorNote open={doctorOpen} onClose={() => setDoctorOpen(false)} checkins={checkins} onDelete={remove} />
    </Card>
  );
}

function DayNotes({ checkin, onDelete }) {
  const feeling = FEELING[checkin.feeling] ?? FEELING[''];
  const lang = languageByCode(checkin.language);
  return (
    <Box sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', bgcolor: '#fff', p: { xs: 1.75, sm: 2 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: checkin.points.length ? 1.25 : 0 }}>
        <Box sx={{ px: 1.5, py: 0.5, borderRadius: 99, bgcolor: feeling.color, color: '#fff', fontSize: 13.5, fontWeight: 650 }}>
          {feeling.label}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }} noWrap>
          {checkin.day === dayKey(new Date()) ? 'Today' : longDay(checkin.day)}
        </Typography>
        <IconButton onClick={onDelete} aria-label="Delete these notes" sx={{ width: 44, height: 44, color: 'text.secondary' }}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      {!checkin.noted ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>The notes could not be written yet — they will be tried again soon.</Typography>
      ) : checkin.points.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nothing about your health was noted from this chat.</Typography>
      ) : (
        <Box component="ul" lang={lang.code} sx={{ m: 0, pl: 2.5, '& li': { fontSize: 15, lineHeight: 1.6, mb: 0.25 } }}>
          {checkin.points.map((p) => <li key={p}>{p}</li>)}
        </Box>
      )}

      {checkin.tellDoctor?.length > 0 && (
        <Box sx={{ mt: 1.5, p: 1.5, borderRadius: '10px', bgcolor: TINT, borderLeft: `4px solid ${BLUE}` }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.5, color: BLUE_DARK }}>
            <MedicalServicesOutlinedIcon sx={{ fontSize: 18 }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 650 }}>Tell your doctor</Typography>
          </Stack>
          <Box component="ul" lang={lang.code} sx={{ m: 0, pl: 2.5, '& li': { fontSize: 14.5, lineHeight: 1.55 } }}>
            {checkin.tellDoctor.map((t) => <li key={t}>{t}</li>)}
          </Box>
        </Box>
      )}
    </Box>
  );
}

/** The check-ins of the last days, gathered into a short note to show the doctor. */
function DoctorNote({ open, onClose, checkins, onDelete }) {
  const phone = useMediaQuery(APP_LAYOUT_QUERY);
  const [days, setDays] = useState(30);
  const [note, setNote] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setNote(null);
    setError('');
    api.fetchDoctorNote(days, controller.signal)
      .then(setNote)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
    // A deleted day changes the summary, so it is fetched again.
  }, [open, days, checkins.length]);

  const asText = () => [
    `Health notes from daily check-ins (last ${days} days)`,
    note.summary,
    ...note.items.map((i) => `- ${i.text}${i.dates ? ` (${i.dates})` : ''}`),
  ].filter(Boolean).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the note is still on screen */ }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} fullWidth maxWidth="sm" aria-labelledby="doctor-note-title">
      <Stack direction="row" sx={{ alignItems: 'center', px: 2.5, pt: 'calc(env(safe-area-inset-top, 0px) + 12px)', pb: 1 }}>
        <Typography id="doctor-note-title" component="h2" sx={{ flex: 1, fontFamily: fonts.display, fontWeight: 700, fontSize: 18 }}>
          For your doctor
        </Typography>
        <IconButton onClick={onClose} aria-label="Close" sx={{ width: 44, height: 44 }}><CloseRoundedIcon /></IconButton>
      </Stack>
      <DialogContent sx={{ pt: 1 }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={days}
          onChange={(_, v) => v && setDays(v)}
          aria-label="How many days"
          sx={{ mb: 2.5, '& .MuiToggleButton-root': { minHeight: 40, px: 2, textTransform: 'none', fontSize: 14 } }}
        >
          <ToggleButton value={7}>7 days</ToggleButton>
          <ToggleButton value={14}>14 days</ToggleButton>
          <ToggleButton value={30}>30 days</ToggleButton>
        </ToggleButtonGroup>

        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : !note ? (
          <Stack spacing={1.25} aria-label="Writing the note">
            <Skeleton variant="rounded" height={52} />
            {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={34} />)}
          </Stack>
        ) : note.count === 0 ? (
          <Typography sx={{ color: 'text.secondary' }}>No check-ins in the last {days} days yet.</Typography>
        ) : (
          <Box aria-live="polite">
            <Typography sx={{ fontSize: 16, lineHeight: 1.6 }}>{note.summary}</Typography>
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mt: 1.5 }}>
              {['good', 'okay', 'unwell'].filter((f) => note.feelings[f]).map((f) => (
                <Box key={f} sx={{ px: 1.25, py: 0.4, borderRadius: 99, bgcolor: `${FEELING[f].color}14`, color: FEELING[f].color, fontSize: 13, fontWeight: 650 }}>
                  {FEELING[f].label}: {note.feelings[f]} {note.feelings[f] === 1 ? 'day' : 'days'}
                </Box>
              ))}
            </Stack>

            {note.items.length > 0 && (
              <Stack spacing={1} component="ul" sx={{ listStyle: 'none', p: 0, m: 0, mt: 2.5 }}>
                {note.items.map((item) => (
                  <Box component="li" key={item.text} sx={{ p: 1.5, borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontSize: 15.5, fontWeight: 550, lineHeight: 1.45 }}>{item.text}</Typography>
                    {item.dates && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{item.dates}</Typography>}
                  </Box>
                ))}
              </Stack>
            )}

            <Button onClick={copy} startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />} sx={{ mt: 2.5, minHeight: 44 }}>
              {copied ? 'Copied' : 'Copy the note'}
            </Button>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
              From {note.count} daily check-in{note.count === 1 ? '' : 's'}: what you said, in short. Not a medical record.
            </Typography>
          </Box>
        )}

        {/* Every day's own notes, below the summary */}
        {checkins.length > 0 && (
          <Box component="section" aria-labelledby="day-notes-title" sx={{ mt: 3.5 }}>
            <Typography id="day-notes-title" component="h3" sx={{ fontWeight: 700, fontSize: 16, mb: 1.25 }}>Day by day</Typography>
            <Stack spacing={1.5}>
              {checkins.map((c) => <DayNotes key={c.id} checkin={c} onDelete={() => onDelete(c)} />)}
            </Stack>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
