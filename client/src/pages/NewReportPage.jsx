import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, ButtonBase, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ContentPasteRoundedIcon from '@mui/icons-material/ContentPasteRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import { ProfileAvatar, ProfileSwitcherMenu } from '../components/profiles';
import { PageBody } from '../components/ui';
import { formatBytes, plural } from '../lib/format';
import usePageTitle from '../lib/usePageTitle';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Page count of a local PDF, or null when it cannot be opened. */
async function countPdfPages(file) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    return (await task.promise).numPages;
  } catch {
    return null;
  } finally {
    task.destroy();
  }
}

const isPdf = (file) => file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));

/**
 * Upload — one PDF, chosen, dropped or pasted. Nothing else on the page but
 * whose profile it is going to, so a report never lands in the wrong person.
 */
export default function NewReportPage() {
  usePageTitle('Upload');
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pages, setPages] = useState(undefined);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const busy = progress !== null;

  /** Takes a file from any route in, PDFs only. */
  const take = useCallback((file) => {
    if (!file) return;
    if (!isPdf(file)) {
      setError(`"${file.name || 'That file'}" is not a PDF. Only PDF files can be uploaded.`);
      return;
    }
    setError('');
    setPdf(file);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPages(undefined);
    if (pdf) {
      countPdfPages(pdf).then((count) => {
        if (cancelled) return;
        setPages(count);
        if (count === null) setError('This PDF could not be opened. It may be damaged or password-protected.');
      });
    }
    return () => { cancelled = true; };
  }, [pdf]);

  // ⌘V / Ctrl+V anywhere on the page pastes a copied PDF file.
  useEffect(() => {
    const onPaste = (event) => {
      if (busy) return;
      const file = [...(event.clipboardData?.files ?? [])][0];
      if (file) {
        event.preventDefault();
        take(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [take, busy]);

  /** The Paste button: reads a PDF from the clipboard where the browser allows it. */
  const pasteFromClipboard = async () => {
    setError('');
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t === 'application/pdf');
        if (type) {
          const blob = await item.getType(type);
          take(new File([blob], 'pasted.pdf', { type }));
          return;
        }
      }
      setError('There is no PDF on the clipboard. Copy a PDF file first.');
    } catch {
      // Most browsers only hand over a copied file through a paste event.
      setError('Your browser did not share the clipboard. Copy the PDF file, then press ⌘V (Mac) or Ctrl+V here.');
    }
  };

  const submit = async () => {
    if (!pdf || !pages || busy) return;
    setError('');
    setProgress(0);
    try {
      const report = await api.uploadReport({ pdf }, setProgress);
      navigate(`/reports/${report.id}`);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  return (
    <PageBody maxWidth={640}>
      <Stack spacing={2.5}>
        <UploadingFor />

        {!pdf ? (
          <Box
            onDragOver={(event) => { event.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setOver(false);
              take(event.dataTransfer.files?.[0]);
            }}
            sx={{
              border: '1px dashed',
              borderColor: over ? 'primary.main' : '#cbd5e1',
              bgcolor: over ? 'rgba(47,124,247,0.05)' : '#fff',
              borderRadius: '14px',
              px: 3, py: { xs: 5, sm: 6 },
              textAlign: 'center',
              transition: 'background-color 150ms, border-color 150ms',
            }}
          >
            <Box sx={{ width: 64, height: 64, mx: 'auto', borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }}>
              <CloudUploadOutlinedIcon sx={{ fontSize: 32 }} />
            </Box>
            <Typography variant="h6" sx={{ mt: 2 }}>Upload a report PDF</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>PDF files only</Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ justifyContent: 'center', mt: 3 }}>
              <Button variant="contained" size="large" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => inputRef.current?.click()}>
                Choose PDF
              </Button>
              <Button variant="outlined" size="large" startIcon={<ContentPasteRoundedIcon />} onClick={pasteFromClipboard} sx={{ bgcolor: '#fff' }}>
                Paste
              </Button>
            </Stack>
            {/* Dropping and ⌘V need a mouse and keyboard; touch screens skip the hint. */}
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 2, '@media (hover: none)': { display: 'none' } }}>
              or drop it here · ⌘V / Ctrl+V pastes a copied PDF
            </Typography>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(event) => {
                take(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </Box>
        ) : (
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: '14px', bgcolor: '#fff', p: 2 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
                <PictureAsPdfOutlinedIcon />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 650 }} noWrap>{pdf.name}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {[pages ? plural(pages, 'page') : pages === undefined ? 'Checking…' : null, formatBytes(pdf.size)].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {!busy && (
                <IconButton aria-label="Remove this PDF" onClick={() => { setPdf(null); setError(''); }}>
                  <CloseRoundedIcon />
                </IconButton>
              )}
            </Stack>

            {busy ? (
              <Stack spacing={0.75} sx={{ mt: 2 }}>
                <LinearProgress variant={progress < 1 ? 'determinate' : 'indeterminate'} value={progress * 100} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Starting…'}
                </Typography>
              </Stack>
            ) : (
              <Button variant="contained" size="large" fullWidth onClick={submit} disabled={!pages} sx={{ mt: 2 }}>
                Analyse
              </Button>
            )}
          </Box>
        )}

        {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      </Stack>
    </PageBody>
  );
}

/** "Uploading for — Ragavan ⇄": whose reports this goes into. Tap to switch. */
function UploadingFor() {
  const { profile } = useAuth();
  const [anchor, setAnchor] = useState(null);
  if (!profile) return null;
  return (
    <>
      <ButtonBase
        onClick={(event) => setAnchor(event.currentTarget)}
        aria-label={`Uploading for ${profile.name}. Switch profile`}
        aria-haspopup="menu"
        sx={{
          width: '100%', gap: 1.5, justifyContent: 'flex-start', textAlign: 'left',
          px: 1.75, py: 1.25,
          bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
          '&:hover': { borderColor: '#cbd5e1' },
        }}
      >
        <ProfileAvatar profile={profile} size={40} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>Uploading for</Typography>
          <Typography sx={{ fontWeight: 650, fontSize: 16, lineHeight: 1.35 }} noWrap>{profile.name}</Typography>
        </Box>
        <Box aria-hidden sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }}>
          <SwapHorizRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
      </ButtonBase>
      <ProfileSwitcherMenu
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        goHome={false}
      />
    </>
  );
}
