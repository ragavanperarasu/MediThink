import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Alert, Avatar, Box, Chip, CircularProgress, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import * as api from '../api';
import EvidenceMarkdown from './EvidenceMarkdown';
import { MediThinkMark } from '../brand/Logo';
import { formatDateTime } from '../lib/format';
import { languageByCode } from '../lib/languages';
import { canSpeak, copyText, plainText, speak, stopSpeaking, unlockSpeech } from '../lib/readAloud';
import VoiceMode, { canConverse } from './VoiceMode';
import { cloudListening, listenOnce } from '../lib/listen';

/**
 * One Assistant thread: about one report (every figure pinned to its page),
 * one kind of report, or all of them (every figure linked to its report).
 * `thread` is what GET /api/ask returns; the thread is stored per profile, so
 * it is there when it is opened again.
 *
 * `clearSlot`, when given, is an element at the top of the page where the
 * Clear button is placed; otherwise the panel shows it in its own top row.
 */
/*
 * The message box is a full pill; the round buttons inside it sit an equal
 * INSET from its top, bottom and right edge, so the send circle follows the
 * pill's curve exactly.
 */
const BOX_HEIGHT = 48;
const INSET = 5;
const ROUND = BOX_HEIGHT - INSET * 2; // 38

/** "blood test", but "ECG" stays as it is. */
const kindWord = (label) => (/^[A-Z]{2,}/.test(label) ? label : label.toLowerCase());

export default function AskPanel({ thread, clearSlot = null, language = 'en' }) {
  const one = thread.kind === 'doc';
  const [messages, setMessages] = useState(thread.messages ?? []);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  // The answer so far while it streams in; '' until the first words arrive.
  const [typing, setTyping] = useState('');
  const [error, setError] = useState('');
  const endRef = useRef(null);
  // Voice conversation: speak a question, hear the answer.
  const [voiceOpen, setVoiceOpen] = useState(false);
  const openVoice = () => {
    dictation.cancel();
    stopSpeaking();
    setSpeaking(null);
    unlockSpeech(); // on the tap itself — some phones only allow speech that a tap starts
    setVoiceOpen(true);
  };
  const addTurns = useCallback((turns) => setMessages((current) => [...current, ...turns]), []);
  // Which answer is being read aloud; one at a time.
  const [speaking, setSpeaking] = useState(null);
  const speakRun = useRef(0);
  useEffect(() => () => stopSpeaking(), []);
  const toggleSpeak = (key, content) => {
    if (speaking === key) {
      stopSpeaking();
      setSpeaking(null);
      return;
    }
    unlockSpeech();
    const run = ++speakRun.current;
    setSpeaking(key);
    speak(plainText(content), { chosen: language, onEnd: () => { if (speakRun.current === run) setSpeaking(null); } });
  };
  const scrollRef = useRef(null);
  const dictation = useDictation(draft, setDraft, setError, language);

  useEffect(() => { setMessages(thread.messages ?? []); }, [thread.scope, thread.messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  // While an answer types out, keep it in view — unless the reader has scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (typing && el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTop = el.scrollHeight;
  }, [typing]);

  const suggestions = useMemo(() => {
    const flagged = thread.flagged ?? [];
    if (thread.kind === 'doc') {
      return [
        'Explain this report in simple words',
        ...(flagged.length ? ['Which results are outside the normal range?', `What does ${flagged[0]} measure?`] : ['Are all the results within range?']),
        'What should I ask my doctor about this report?',
      ];
    }
    if (thread.kind === 'type') {
      const kind = kindWord(thread.label);
      return [
        `Explain my latest ${kind}`,
        ...(thread.count > 1 ? [`How have my ${kind} results changed over time?`] : []),
        ...(flagged.length ? ['Which results are out of range?'] : []),
        'What should I ask my doctor?',
      ];
    }
    return [
      'Summarise all my reports',
      ...(flagged.length ? ['Which results are out of range?'] : []),
      'What should I ask my doctor?',
    ];
  }, [thread]);

  const send = async (text) => {
    const question = (text ?? draft).trim();
    if (!question || pending) return;
    dictation.cancel();
    setError('');
    setDraft('');
    setPending(question);
    setTyping('');
    try {
      const turns = await api.ask(thread.scope, question, setTyping, undefined, language);
      setMessages((current) => [...current, ...turns]);
    } catch (err) {
      setError(err.message);
      setDraft(question);
    } finally {
      setPending(null);
      setTyping('');
    }
  };

  const clear = async () => {
    if (!window.confirm('Clear this conversation? The questions and answers will be removed.')) return;
    try {
      await api.clearThread(thread.scope);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const empty = messages.length === 0 && !pending;

  const clearButton = messages.length > 0 && (
    <Tooltip title="Clear conversation">
      <IconButton onClick={clear} aria-label="Clear conversation" sx={{ color: 'text.secondary' }}>
        <DeleteSweepOutlinedIcon />
      </IconButton>
    </Tooltip>
  );

  return (
    <Stack sx={{ height: '100%', minHeight: 420 }}>
      <VoiceMode
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        scope={thread.scope}
        label={thread.label}
        language={language}
        onTurns={addTurns}
      />
      {clearSlot
        ? clearButton && createPortal(clearButton, clearSlot)
        : clearButton && (
          <Stack direction="row" sx={{ justifyContent: 'flex-end', px: 1, pt: 0.5 }}>{clearButton}</Stack>
        )}
      <Box ref={scrollRef} sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 2.5 }, py: 2.5 }}>
        {empty ? (
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
            <Box sx={{ p: 1.5, borderRadius: 3, background: 'linear-gradient(120deg, #12b6fd14, #4c4bec14)' }}>
              <ForumOutlinedIcon sx={{ fontSize: 30, color: 'primary.main' }} />
            </Box>
            <Typography variant="h5">
              {one ? 'Ask about this report' : thread.kind === 'type' ? `Ask about your ${kindWord(thread.label)} reports` : 'Ask about all your reports'}
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
              {one ? 'Answers come only from this report.' : 'Answers come only from your reports.'} MediThink explains — it does not diagnose.
            </Typography>
            {language !== 'en' && (
              <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
                Answers in {languageByCode(language).native}
              </Typography>
            )}
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, justifyContent: 'center', maxWidth: 560, pt: 1 }}>
              {suggestions.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  onClick={() => send(s)}
                  variant="outlined"
                  sx={{ fontWeight: 500, bgcolor: '#fff', '&:hover': { borderColor: 'primary.main', color: 'primary.main' } }}
                />
              ))}
            </Stack>
          </Stack>
        ) : (
          <Stack spacing={2.5}>
            {messages.map((message, index) => (
              <Message
                key={`${index}-${message.at}`}
                message={message}
                speaking={speaking === index}
                onSpeak={() => toggleSpeak(index, message.content)}
              />
            ))}
            {pending && (
              <>
                <Message message={{ role: 'user', content: pending }} />
                {typing ? (
                  // The answer as it is being written.
                  <Message message={{ role: 'assistant', content: typing }} typing />
                ) : (
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <AssistantAvatar />
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                      <CircularProgress size={14} />
                      <Typography variant="body2">{one ? 'Reading the report…' : 'Reading your reports…'}</Typography>
                    </Stack>
                  </Stack>
                )}
              </>
            )}
          </Stack>
        )}
        <div ref={endRef} />
      </Box>

      <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pt: 0.5, pb: 1.5, bgcolor: '#fff' }}>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>{error}</Alert>}
        {/* One rounded box: voice and send inside it, on the right. */}
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <TextField
            fullWidth
            multiline
            maxRows={5}
            size="small"
            placeholder={dictation.transcribing ? 'Writing what you said…' : dictation.listening ? `Listening in ${languageByCode(language).native}…` : one ? 'Ask about this report…' : 'Ask about your reports…'}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            disabled={Boolean(pending)}
            slotProps={{
              htmlInput: { maxLength: 2000, 'aria-label': 'Your question' },
              input: {
                endAdornment: (
                  <InputAdornment position="end" sx={{ alignSelf: 'flex-end', height: ROUND, maxHeight: 'none', m: 0, ml: 0.75, gap: 0.25 }}>
                    {dictation.supported && (
                      <Tooltip title={dictation.listening ? 'Stop' : 'Speak your question'}>
                        <IconButton
                          onClick={dictation.listening ? dictation.stop : dictation.start}
                          disabled={Boolean(pending) || dictation.transcribing}
                          aria-label={dictation.listening ? 'Stop listening' : 'Speak your question'}
                          aria-pressed={dictation.listening}
                          sx={{
                            width: ROUND, height: ROUND, p: 0,
                            color: dictation.listening ? '#fff' : 'text.secondary',
                            bgcolor: dictation.listening ? 'error.main' : 'transparent',
                            '&:hover': { bgcolor: dictation.listening ? 'error.dark' : 'grey.100' },
                            '& svg': { fontSize: 22 },
                          }}
                        >
                          {dictation.listening ? <StopRoundedIcon /> : <MicNoneRoundedIcon />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {/* Empty box: talk instead (voice conversation). Something typed: send it. */}
                    {!draft.trim() && canConverse ? (
                      <Tooltip title="Voice conversation">
                        <span>
                          <IconButton
                            onClick={openVoice}
                            disabled={Boolean(pending)}
                            aria-label="Start voice conversation"
                            sx={{
                              width: ROUND, height: ROUND, p: 0,
                              bgcolor: '#12235c', color: '#fff',
                              '&:hover': { bgcolor: '#0b1740' },
                              '&.Mui-disabled': { bgcolor: 'grey.200', color: 'grey.400' },
                              '& svg': { fontSize: 22 },
                            }}
                          >
                            <GraphicEqRoundedIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <IconButton
                        type="submit"
                        disabled={!draft.trim() || Boolean(pending)}
                        aria-label="Send"
                        sx={{
                          width: ROUND, height: ROUND, p: 0,
                          bgcolor: 'primary.main', color: '#fff',
                          '&:hover': { bgcolor: 'primary.dark' },
                          '&.Mui-disabled': { bgcolor: 'grey.200', color: 'grey.400' },
                          '& svg': { fontSize: 20 },
                        }}
                      >
                        <ArrowUpwardRoundedIcon />
                      </IconButton>
                    )}
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: `${BOX_HEIGHT / 2}px`,
                py: `${INSET}px`,
                pl: 2.25,
                pr: `${INSET}px`,
                minHeight: BOX_HEIGHT,
                alignItems: 'flex-end',
                bgcolor: 'grey.50',
                // 16px also stops iOS from zooming in when the box is tapped.
                fontSize: 16,
                '& fieldset': { borderColor: 'grey.200' },
                '&.Mui-focused': { bgcolor: '#fff' },
              },
              // One line of 16px text (23px tall) centred in the round buttons' height.
              '& textarea': { py: `${(ROUND - 23) / 2}px`, lineHeight: '23px' },
              '& textarea::placeholder': { color: 'text.secondary', opacity: 0.8 },
            }}
          />
        </Box>
      </Box>
    </Stack>
  );
}

/*
 * Speak a question instead of typing it, with the browser's own speech
 * recognition (Chrome, Edge, Safari). Words appear in the box as they are
 * heard; nothing is sent until Send is pressed. Hidden where unsupported.
 */
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/*
 * The mic in the message box. With OpenAI speech to text set up on the
 * server, the question is recorded and turned into text when the speaker
 * stops (or taps again); otherwise the browser's own speech recognition
 * listens, showing words as they are said. Either way it listens for the
 * answer language chosen at the top.
 */
function useDictation(draft, setDraft, setError, language) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [cloud, setCloud] = useState(false);
  const recognitionRef = useRef(null);
  const recordingRef = useRef(null);

  useEffect(() => { cloudListening().then(setCloud); }, []);
  useEffect(() => () => {
    recognitionRef.current?.abort();
    recordingRef.current?.cancel();
  }, []);
  // Switching language mid-sentence stops listening; the next tap listens in the new one.
  useEffect(() => () => {
    recognitionRef.current?.stop();
    recordingRef.current?.cancel();
  }, [language]);

  const micError = (name) => {
    if (name === 'NotAllowedError' || name === 'not-allowed' || name === 'service-not-allowed') {
      setError('Microphone access was blocked. Allow it in the browser to speak a question.');
    } else if (name === 'NotFoundError') {
      setError('No microphone was found.');
    }
  };

  const startCloud = () => {
    if (recordingRef.current) return;
    // Spoken words are added after whatever is already typed.
    const before = draft.trim() ? `${draft.trim()} ` : '';
    const recording = listenOnce({
      language,
      onPhase: (phase) => {
        setListening(phase === 'listening');
        setTranscribing(phase === 'transcribing');
      },
    });
    recordingRef.current = recording;
    setError('');
    recording.done
      .then((text) => { if (text) setDraft(before + text); })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') micError(err.name);
        else setError(err.message || 'Voice input stopped. Please try again or type the question.');
      })
      .finally(() => {
        if (recordingRef.current === recording) recordingRef.current = null;
        setListening(false);
        setTranscribing(false);
      });
  };

  const startBrowser = () => {
    if (!Recognition || recognitionRef.current) return;
    const recognition = new Recognition();
    recognition.lang = languageByCode(language).speech;
    recognition.interimResults = true;
    recognition.continuous = false;
    const before = draft.trim() ? `${draft.trim()} ` : '';
    recognition.onresult = (event) => {
      const heard = Array.from(event.results, (result) => result[0].transcript).join('');
      setDraft(before + heard);
    };
    recognition.onerror = (event) => {
      if (event.error === 'language-not-supported') {
        setError(`This browser cannot listen in ${languageByCode(language).name} yet. Type the question, or try Chrome on Android.`);
      } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        micError(event.error);
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setError('Voice input stopped. Please try again or type the question.');
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    setError('');
    setListening(true);
    recognition.start();
  };

  return {
    supported: cloud || Boolean(Recognition),
    listening,
    transcribing,
    start: () => (cloud ? startCloud() : startBrowser()),
    /** Done speaking: what was said is written into the box. */
    stop: () => {
      recognitionRef.current?.stop();
      recordingRef.current?.stop();
    },
    /** Drops it — nothing is written. */
    cancel: () => {
      recognitionRef.current?.abort();
      recordingRef.current?.cancel();
    },
  };
}

function AssistantAvatar() {
  return (
    <Avatar sx={{ width: 30, height: 30, bgcolor: '#fff', border: 1, borderColor: 'divider' }}>
      <MediThinkMark size={20} />
    </Avatar>
  );
}

function Message({ message, typing = false, speaking = false, onSpeak }) {
  if (message.role === 'user') {
    return (
      <Stack sx={{ alignItems: 'flex-end' }}>
        <Box
          sx={{
            maxWidth: '85%', px: 2, py: 1.25, borderRadius: '16px 16px 4px 16px',
            bgcolor: 'primary.main', color: '#fff', whiteSpace: 'pre-wrap', fontSize: '0.9rem',
          }}
        >
          {message.content}
        </Box>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={{ xs: 0, sm: 1.5 }} sx={{ alignItems: 'flex-start' }}>
      {/* On a phone the answer takes the full width, so tables fit. */}
      <Box sx={{ display: { xs: 'none', sm: 'block' } }}><AssistantAvatar /></Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {/* The answer sits on the page itself — only the question has a bubble. */}
        <Box sx={{ pt: { sm: 0.5 } }}>
          <EvidenceMarkdown content={message.content} dense />
          {typing && <TypingDot />}
        </Box>
        {message.at && !typing && <AnswerActions message={message} speaking={speaking} onSpeak={onSpeak} />}
      </Box>
    </Stack>
  );
}

/** A softly pulsing dot under an answer that is still being written. */
function TypingDot() {
  return (
    <Box
      aria-hidden
      sx={{
        width: 8, height: 8, mt: 1, borderRadius: '50%', bgcolor: 'primary.main',
        animation: 'mtTyping 1s ease-in-out infinite',
        '@keyframes mtTyping': { '0%, 100%': { opacity: 0.25, transform: 'scale(0.8)' }, '50%': { opacity: 1, transform: 'scale(1)' } },
      }}
    />
  );
}

/** Under an answer: when it was written, Copy, and Speak (the browser's own voice). */
function AnswerActions({ message, speaking, onSpeak }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyText(plainText(message.content))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  const button = {
    width: 32, height: 32, color: 'text.secondary',
    '&:hover': { bgcolor: 'grey.100', color: 'text.primary' },
    '& svg': { fontSize: 18 },
  };
  return (
    <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', mt: 0.5, ml: -0.75 }}>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton onClick={copy} aria-label={copied ? 'Copied' : 'Copy answer'} sx={{ ...button, ...(copied && { color: '#16a34a' }) }}>
          {copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
        </IconButton>
      </Tooltip>
      {canSpeak && (
        <Tooltip title={speaking ? 'Stop reading' : 'Read aloud'}>
          <IconButton
            onClick={onSpeak}
            aria-label={speaking ? 'Stop reading' : 'Read answer aloud'}
            aria-pressed={speaking}
            sx={{ ...button, ...(speaking && { color: 'primary.main', bgcolor: 'rgba(47,124,247,0.1)' }) }}
          >
            {speaking ? <StopCircleOutlinedIcon /> : <VolumeUpRoundedIcon />}
          </IconButton>
        </Tooltip>
      )}
      <Typography variant="caption" sx={{ color: 'text.disabled', pl: 0.75 }}>{formatDateTime(message.at)}</Typography>
    </Stack>
  );
}
