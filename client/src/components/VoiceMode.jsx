import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, Dialog, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import * as api from '../api';
import { APP_LAYOUT_QUERY } from '../lib/layout';
import { languageByCode } from '../lib/languages';
import { createSpeaker, plainText } from '../lib/readAloud';
import { canRecord, cloudListening, listenOnce } from '../lib/listen';

/*
 * Voice conversation: speak a question, hear the answer, speak again — in the
 * answer language chosen at the top. Listening and speaking are the browser's
 * own (SpeechRecognition and speechSynthesis); the question goes to the
 * Assistant exactly as a typed one does, and lands in the chat thread too.
 *
 * listening → (you stop talking) → thinking → speaking → listening …
 * Tapping the circle interrupts: while it speaks, it stops and listens; while
 * it listens, it sends what it has heard.
 */

const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const canConverse = (Boolean(Recognition) || canRecord) && typeof window !== 'undefined' && 'speechSynthesis' in window;

const STATE_TEXT = {
  idle: 'Tap the circle to speak',
  listening: 'Listening…',
  thinking: 'Thinking…',
  speaking: 'Speaking — tap to interrupt',
};

export default function VoiceMode({ open, onClose, scope, label, language, onTurns }) {
  const phone = useMediaQuery(APP_LAYOUT_QUERY);
  const lang = languageByCode(language);
  const [state, setState] = useState('idle');
  const [heard, setHeard] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const alive = useRef(false);
  const recognition = useRef(null);
  const speaker = useRef(null);
  const request = useRef(null);
  const listenRef = useRef(null);
  const recording = useRef(null);
  // OpenAI speech to text when the server has it; the browser's own listening otherwise.
  const [cloud, setCloud] = useState(null);
  useEffect(() => { cloudListening().then(setCloud); }, []);

  const stopAll = useCallback(() => {
    const rd = recording.current;
    recording.current = null;
    rd?.cancel();
    const rec = recognition.current;
    recognition.current = null;
    rec?.abort();
    const sp = speaker.current;
    speaker.current = null;
    sp?.stop();
    request.current?.abort();
    request.current = null;
  }, []);

  /** Sends what was heard; reads the answer as it arrives; then listens again. */
  const ask = useCallback(async (question) => {
    setState('thinking');
    setReply('');
    const controller = new AbortController();
    request.current = controller;
    const sp = createSpeaker({
      chosen: language,
      onDone: () => {
        if (speaker.current !== sp) return;
        speaker.current = null;
        if (alive.current) listenRef.current?.();
      },
    });
    speaker.current = sp;

    /*
     * Read each sentence as soon as it is complete, so the voice starts while
     * the rest of the answer is still being written. `spoken` is how far into
     * the answer has been sent to the voice: whole lines, then characters of
     * the line still arriving.
     */
    let spokenLines = 0;
    let spokenInLine = 0;
    const say = (markdown) => {
      const text = plainText(markdown);
      if (text) {
        sp.push(text);
        setState('speaking');
      }
    };
    const readNew = (markdown, final) => {
      const lines = markdown.split('\n');
      const complete = final ? lines : lines.slice(0, -1);
      if (complete.length > spokenLines) {
        say([complete[spokenLines].slice(spokenInLine), ...complete.slice(spokenLines + 1)].join('\n'));
        spokenLines = complete.length;
        spokenInLine = 0;
      }
      if (final) return;
      // The line still arriving: up to its last finished sentence (not the dot in "10.8").
      const tail = lines[lines.length - 1];
      let end = -1;
      for (const match of tail.matchAll(/[.!?।؟](?=\s)/g)) end = match.index + 1;
      if (end > spokenInLine) {
        say(tail.slice(spokenInLine, end));
        spokenInLine = end;
      }
    };
    const onText = (markdown) => {
      readNew(markdown, false);
      setReply(plainText(markdown));
    };

    try {
      const turns = await api.ask(scope, question, onText, controller.signal, language, 'voice');
      request.current = null;
      onTurns?.(turns);
      const full = turns[1]?.content ?? '';
      setReply(plainText(full));
      readNew(full, true); // whatever is left
      sp.finish();
    } catch (err) {
      if (err.name === 'AbortError' || !alive.current) return;
      sp.stop();
      setError(err.message);
      setState('idle');
    }
  }, [scope, language, onTurns]);

  /** Listens for one question in the chosen language. */
  const listen = useCallback(() => {
    if (!alive.current) return;
    stopAll();
    setError('');
    setHeard('');

    if (cloud) {
      // Records until the speaker goes quiet, then OpenAI writes it out.
      const rd = listenOnce({
        language,
        onPhase: (phase) => setState(phase === 'listening' ? 'listening' : 'thinking'),
      });
      recording.current = rd;
      rd.done
        .then((question) => {
          if (recording.current !== rd || !alive.current) return;
          recording.current = null;
          if (question) {
            setHeard(question);
            ask(question);
          } else {
            setState('idle');
          }
        })
        .catch((err) => {
          if (recording.current !== rd || !alive.current) return;
          recording.current = null;
          setError(err.name === 'NotAllowedError'
            ? 'Microphone access was blocked. Allow it in the browser, then tap the circle.'
            : err.message || 'Could not hear that. Tap the circle to try again.');
          setState('idle');
        });
      return;
    }

    if (!Recognition) {
      setError('This browser cannot listen. Type the question in the chat instead.');
      setState('idle');
      return;
    }
    const rec = new Recognition();
    rec.lang = lang.speech;
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (event) => {
      let interim = '';
      finalText = '';
      for (const result of event.results) {
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setHeard(`${finalText}${interim}`.trim());
    };
    rec.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone access was blocked. Allow it in the browser, then tap the circle.');
      } else if (event.error === 'language-not-supported') {
        setError(`This browser cannot listen in ${lang.name} yet. Try Chrome on Android, or type the question.`);
      }
    };
    rec.onend = () => {
      if (recognition.current !== rec) return;
      recognition.current = null;
      const question = finalText.trim();
      if (question && alive.current) ask(question);
      else setState('idle');
    };
    recognition.current = rec;
    setState('listening');
    try {
      rec.start();
    } catch {
      setState('idle');
    }
  }, [lang, language, cloud, stopAll, ask]);
  listenRef.current = listen;

  // Opening starts listening at once (once it knows how to listen); closing stops everything.
  useEffect(() => {
    if (!open || cloud === null) return undefined;
    alive.current = true;
    setReply('');
    setHeard('');
    setError('');
    listenRef.current?.();
    return () => {
      alive.current = false;
      stopAll();
      setState('idle');
    };
  }, [open, cloud, stopAll]);

  const tapCircle = () => {
    if (state === 'speaking') listen();
    else if (state === 'listening') {
      // Done speaking: send what it has heard.
      recognition.current?.stop();
      recording.current?.stop();
    }
    else if (state === 'idle') listen();
  };

  const caption = state === 'listening' || (state === 'thinking' && !reply) ? heard : reply;
  const status = state === 'listening' && cloud ? 'Listening… tap when done' : STATE_TEXT[state];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={phone}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { bgcolor: '#fff', ...(phone ? {} : { height: 640, borderRadius: '16px' }) } } }}
    >
      <Stack sx={{ height: '100%', pt: 'env(safe-area-inset-top, 0px)', pb: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {/* What it is talking about, in which language. */}
        <Stack direction="row" sx={{ alignItems: 'center', px: 1, py: 1 }}>
          <IconButton onClick={onClose} aria-label="Close voice conversation"><CloseRoundedIcon /></IconButton>
          <Typography sx={{ flex: 1, textAlign: 'center', fontWeight: 650, fontSize: 15 }} noWrap>{label}</Typography>
          <Box lang={lang.code} sx={{ minWidth: 40, px: 1.25, py: 0.5, mr: 0.5, borderRadius: 99, bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main', fontSize: 13, fontWeight: 650, textAlign: 'center' }}>
            {lang.native}
          </Box>
        </Stack>

        <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', px: 3, gap: 3, minHeight: 0 }}>
          <Orb state={state} onClick={tapCircle} />
          <Typography sx={{ color: state === 'idle' ? 'text.secondary' : 'primary.main', fontWeight: 650 }}>
            {status}
          </Typography>
          {/* What it heard, then what it is saying. */}
          <Box sx={{ width: '100%', maxWidth: 420, minHeight: 96, maxHeight: '28vh', overflowY: 'auto', textAlign: 'center' }}>
            {error ? (
              <Typography variant="body2" sx={{ color: 'error.main' }}>{error}</Typography>
            ) : caption ? (
              <Typography
                lang={lang.code}
                sx={{ color: state === 'listening' ? 'text.secondary' : 'text.primary', fontSize: 17, lineHeight: 1.55, whiteSpace: 'pre-line' }}
              >
                {caption}
              </Typography>
            ) : null}
          </Box>
        </Stack>

        <Stack sx={{ alignItems: 'center', gap: 1 }}>
          <ButtonBase
            onClick={onClose}
            aria-label="End voice conversation"
            sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#dc2626', color: '#fff', '&:hover': { bgcolor: '#b91c1c' } }}
          >
            <CloseRoundedIcon sx={{ fontSize: 30 }} />
          </ButtonBase>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>End</Typography>
        </Stack>
      </Stack>
    </Dialog>
  );
}

/** The circle: breathes while listening, turns while thinking, pulses while speaking. */
function Orb({ state, onClick }) {
  const Icon = state === 'speaking' ? GraphicEqRoundedIcon : MicRoundedIcon;
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={state === 'speaking' ? 'Interrupt and speak' : state === 'listening' ? 'Done speaking' : 'Speak'}
      sx={{
        position: 'relative', width: 176, height: 176, borderRadius: '50%',
        background: 'radial-gradient(circle at 32% 28%, #9fd4ff 0%, #2f7cf7 48%, #12235c 100%)',
        color: '#fff',
        opacity: state === 'idle' ? 0.85 : 1,
        animation:
          state === 'listening' ? 'vmBreath 1.8s ease-in-out infinite'
            : state === 'speaking' ? 'vmPulse 0.9s ease-in-out infinite'
              : 'none',
        '@keyframes vmBreath': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.06)' } },
        '@keyframes vmPulse': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.1)' } },
        '@keyframes vmSpin': { to: { transform: 'rotate(360deg)' } },
        '@keyframes vmRipple': { '0%': { transform: 'scale(1)', opacity: 0.5 }, '100%': { transform: 'scale(1.45)', opacity: 0 } },
        // A ring that ripples out while it listens.
        '&::after': state === 'listening' ? {
          content: '""', position: 'absolute', inset: 0, borderRadius: '50%',
          border: '2px solid #2f7cf7', animation: 'vmRipple 1.8s ease-out infinite',
        } : {},
        '& svg': { fontSize: 56 },
      }}
    >
      {state === 'thinking' ? (
        <Box sx={{ width: 64, height: 64, borderRadius: '50%', border: '4px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', animation: 'vmSpin 0.9s linear infinite' }} />
      ) : (
        <Icon />
      )}
    </ButtonBase>
  );
}
