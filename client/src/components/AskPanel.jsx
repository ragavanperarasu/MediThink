import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, IconButton, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import * as api from '../api';
import EvidenceMarkdown from './EvidenceMarkdown';
import { MediThinkMark } from '../brand/Logo';
import { isOutOfRange } from '../lib/values';
import { formatDateTime } from '../lib/format';

/**
 * Questions about this one report, answered from its own text with every
 * figure pinned to the page. The thread is stored on the report, so it is
 * there when the report is opened again.
 */
export default function AskPanel({ report }) {
  const [messages, setMessages] = useState(report.messages ?? []);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => { setMessages(report.messages ?? []); }, [report.id, report.messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, pending]);

  const suggestions = useMemo(() => {
    const flagged = (report.values ?? []).filter((v) => isOutOfRange(v.flag));
    const list = ['Explain this report in simple words'];
    if (flagged.length) {
      list.push('Which results are outside the normal range?');
      list.push(`What does ${flagged[0].name} measure?`);
    } else if ((report.values ?? []).length) {
      list.push('Are all the results within range?');
    }
    list.push('What should I ask my doctor about this report?');
    return list;
  }, [report.values]);

  const send = async (text) => {
    const question = (text ?? draft).trim();
    if (!question || pending) return;
    setError('');
    setDraft('');
    setPending(question);
    try {
      const turns = await api.ask(report.id, question);
      setMessages((current) => [...current, ...turns]);
    } catch (err) {
      setError(err.message);
      setDraft(question);
    } finally {
      setPending(null);
    }
  };

  const clear = async () => {
    if (!window.confirm('Clear this conversation? The questions and answers will be removed.')) return;
    try {
      await api.clearThread(report.id);
      setMessages([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const empty = messages.length === 0 && !pending;

  return (
    <Stack sx={{ height: '100%', minHeight: 420 }}>
      <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 2.5 }, py: 2.5 }}>
        {empty ? (
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
            <Box sx={{ p: 1.5, borderRadius: 3, background: 'linear-gradient(120deg, #12b6fd14, #4c4bec14)' }}>
              <ForumOutlinedIcon sx={{ fontSize: 30, color: 'primary.main' }} />
            </Box>
            <Typography variant="h5">Ask about this report</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>
              Answers come only from this report, with a pin to the page for every figure. MediThink explains — it does not diagnose.
            </Typography>
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
              <Message key={`${index}-${message.at}`} message={message} />
            ))}
            {pending && (
              <>
                <Message message={{ role: 'user', content: pending }} />
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <AssistantAvatar />
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                    <CircularProgress size={14} />
                    <Typography variant="body2">Reading the report…</Typography>
                  </Stack>
                </Stack>
              </>
            )}
          </Stack>
        )}
        <div ref={endRef} />
      </Box>

      <Box sx={{ borderTop: 1, borderColor: 'divider', px: { xs: 1.5, sm: 2.5 }, py: 1.75, bgcolor: '#fff' }}>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1.5 }}>{error}</Alert>}
        <Stack
          component="form"
          direction="row"
          spacing={1}
          sx={{ alignItems: 'flex-end' }}
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {messages.length > 0 && (
            <Tooltip title="Clear conversation">
              <IconButton onClick={clear} aria-label="Clear conversation" sx={{ mb: 0.25 }}>
                <DeleteSweepOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <TextField
            fullWidth
            multiline
            maxRows={5}
            size="small"
            placeholder="Ask about a value, a term, or the whole report…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            disabled={Boolean(pending)}
            slotProps={{ htmlInput: { maxLength: 2000, 'aria-label': 'Your question' } }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3, py: 1.1 } }}
          />
          <Button
            type="submit"
            variant="contained"
            disabled={!draft.trim() || Boolean(pending)}
            aria-label="Send"
            sx={{ minWidth: 44, width: 44, height: 42, p: 0, borderRadius: 3 }}
          >
            <ArrowUpwardRoundedIcon />
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}

function AssistantAvatar() {
  return (
    <Avatar sx={{ width: 30, height: 30, bgcolor: '#fff', border: 1, borderColor: 'divider' }}>
      <MediThinkMark size={20} />
    </Avatar>
  );
}

function Message({ message }) {
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
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
      <AssistantAvatar />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Box sx={{ px: 2, py: 1.5, borderRadius: '4px 16px 16px 16px', bgcolor: 'grey.50', border: 1, borderColor: 'grey.100' }}>
          <EvidenceMarkdown content={message.content} dense />
        </Box>
        {message.at && (
          <Typography variant="caption" sx={{ color: 'text.disabled', ml: 1 }}>{formatDateTime(message.at)}</Typography>
        )}
      </Box>
    </Stack>
  );
}
