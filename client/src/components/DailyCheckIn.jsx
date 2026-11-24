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
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import { APP_LAYOUT_QUERY } from '../lib/layout';
import { languageByCode, savedLanguage } from '../lib/languages';
import { canLive } from '../lib/live';
import { fonts } from '../theme';
import { Card, IconTile } from './ui';
import VoiceMode from './VoiceMode';

/*
 * The home page's daily check-in: a two-minute voice chat (GPT-Live) about
 * how the person is today, a few simple questions guided by their reports.
 * The notes written from it are shown day by day, and gathered into a short
 * note to take to the next doctor visit.
 */

/** One solid brand blue for what needs attention, a light tint behind the rest. */
const BLUE = '#2563eb';
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
const weekday = (key) => fromKey(key).toLocaleDateString(undefined, { weekday: 'short' });
const longDay = (key) => fromKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });

export default function DailyCheckIn() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [talking, setTalking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState('');
  const [doctorOpen, setDoctorOpen] = useState(false);
  const language = savedLanguage(profile?.id);

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
        setSelected('');
      })
      .catch((err) => setError(`Your check-in could not be saved: ${err.message}`))
      .finally(() => setSaving(false));
  }, [language]);

  // The last seven days, today last, each with its check-in if there was one.
  const today = dayKey(new Date());
  const days = useMemo(() => {
    const byDay = new Map([...(data?.recent ?? []), ...(data?.today ? [data.today] : [])].map((c) => [c.day, c]));
    return Array.from({ length: 7 }, (_, i) => {
      const key = dayKey(new Date(Date.now() - (6 - i) * 86_400_000));
      return { key, checkin: byDay.get(key) ?? null };
    });
  }, [data]);

  if (!data && !error) return <Skeleton variant="rounded" height={190} sx={{ borderRadius: '14px', mb: 2.5 }} />;

  const done = data?.today;
  const shown = days.find((d) => d.key === (selected || today));
  const hasNotes = Boolean(done?.points?.length || data?.recent?.length);
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
      <Box sx={{ bgcolor: BLUE, color: '#fff', px: { xs: 2, sm: 2.5 }, pt: { xs: 2, sm: 2.5 }, pb: 1.5 }}>
        <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
          <IconTile icon={RecordVoiceOverOutlinedIcon} size={46} color={BLUE} bg="#fff" />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography id="checkin-title" component="h2" sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 19, lineHeight: 1.3 }}>
              Daily check-in
            </Typography>
            <Typography sx={{ fontSize: 14.5, color: '#fff', opacity: 0.95, mt: 0.25 }}>
              {saving
                ? 'Writing your notes…'
                : done
                  ? 'Done for today.'
                  : `How are you today? A short voice chat${lang.code !== 'en' ? ` in ${lang.native}` : ''}.`}
            </Typography>
          </Box>
        </Stack>
        {/* The doctor note, just under the title */}
        {hasNotes && (
          <Button
            size="small"
            startIcon={<MedicalServicesOutlinedIcon />}
            onClick={() => setDoctorOpen(true)}
            sx={{
              minHeight: 40, mt: 1.25, ml: { xs: 0, sm: 'calc(46px + 14px)' }, px: 1.5, fontSize: 14,
              color: BLUE_DARK, bgcolor: '#fff', '&:hover': { bgcolor: TINT },
            }}
          >
            For your doctor
          </Button>
        )}
      </Box>

      <Box sx={{ px: { xs: 2, sm: 2.5 }, pb: { xs: 2, sm: 2.5 } }}>

        {!available && data && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            {canLive ? 'Voice check-in is not set up on the server yet.' : 'This browser cannot do voice chats. Try Chrome, Edge or Safari.'}
          </Typography>
        )}
        {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError('')}>{error}</Alert>}

        {/* The week, one dot per day coloured by how they felt */}
        <Stack direction="row" role="list" aria-label="The last seven days" sx={{ mt: 2, gap: { xs: 0.5, sm: 1 }, justifyContent: 'space-between', maxWidth: 520 }}>
          {days.map(({ key, checkin }) => (
            <DayDot
              key={key}
              day={key}
              checkin={checkin}
              today={key === today}
              selected={key === (selected || today)}
              onClick={() => setSelected(key)}
            />
          ))}
        </Stack>

        {/* The chosen day's notes */}
        <Box sx={{ mt: 2 }} aria-live="polite">
          {shown?.checkin ? (
            <DayNotes checkin={shown.checkin} isToday={shown.key === today} onDelete={() => remove(shown.checkin)} />
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {shown?.key === today ? 'No check-in yet today.' : `No check-in on ${longDay(shown.key)}.`}
            </Typography>
          )}
        </Box>

        {/* The one thing to do — always about today, since that is where a chat is kept */}
        {shown?.key === today ? (
          <Button
            fullWidth
            variant={done ? 'outlined' : 'contained'}
            startIcon={<MicRoundedIcon />}
            onClick={() => { setError(''); setTalking(true); }}
            disabled={!available || saving}
            sx={{
              mt: 2, minHeight: 48, maxWidth: { sm: 320 }, fontSize: 15,
              ...(done
                ? { color: BLUE_DARK, borderColor: BLUE, '&:hover': { borderColor: BLUE_DARK, bgcolor: TINT } }
                : { bgcolor: BLUE, '&:hover': { bgcolor: BLUE_DARK } }),
            }}
          >
            {done ? "Update today's check-in" : 'Start check-in'}
          </Button>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1.5 }}>
            Check-ins are saved for today only.{' '}
            <ButtonBase onClick={() => setSelected('')} sx={{ color: BLUE_DARK, fontWeight: 650, fontSize: 'inherit', verticalAlign: 'baseline', minHeight: 32 }}>
              Go to today
            </ButtonBase>
          </Typography>
        )}
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
      <DoctorNote open={doctorOpen} onClose={() => setDoctorOpen(false)} />
    </Card>
  );
}

function DayDot({ day, checkin, today, selected, onClick }) {
  const feeling = checkin ? FEELING[checkin.feeling] ?? FEELING[''] : null;
  const label = `${longDay(day)}: ${feeling ? feeling.label : 'no check-in'}`;
  return (
    <ButtonBase
      role="listitem"
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected}
      sx={{
        flex: 1, minWidth: 0, minHeight: 64, py: 0.75, borderRadius: '12px',
        flexDirection: 'column', gap: 0.5,
        bgcolor: selected ? TINT : 'transparent',
        outline: selected ? `2px solid ${BLUE}` : 'none',
      }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: today ? 700 : 500, color: today ? BLUE_DARK : 'text.secondary' }}>
        {today ? 'Today' : weekday(day)}
      </Typography>
      <Box
        aria-hidden
        sx={{
          width: 26, height: 26, borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          bgcolor: feeling ? feeling.color : 'transparent',
          border: feeling ? 'none' : '2px dashed #cbd5e1',
          color: '#fff',
        }}
      >
        {feeling && <CheckRoundedIcon sx={{ fontSize: 16 }} />}
      </Box>
    </ButtonBase>
  );
}

function DayNotes({ checkin, isToday, onDelete }) {
  const feeling = FEELING[checkin.feeling] ?? FEELING[''];
  const lang = languageByCode(checkin.language);
  return (
    <Box sx={{ borderRadius: '12px', border: '1px solid #e2e8f0', bgcolor: '#fff', p: { xs: 1.75, sm: 2 } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: checkin.points.length ? 1.25 : 0 }}>
        <Box sx={{ px: 1.5, py: 0.5, borderRadius: 99, bgcolor: feeling.color, color: '#fff', fontSize: 13.5, fontWeight: 650 }}>
          {feeling.label}
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }} noWrap>
          {isToday ? 'Today' : longDay(checkin.day)}
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
function DoctorNote({ open, onClose }) {
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
  }, [open, days]);

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
      </DialogContent>
    </Dialog>
  );
}
