import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Divider, Grid, LinearProgress, Stack, TextField, Typography,
} from '@mui/material';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as api from '../api';
import FileDrop from '../components/FileDrop';
import { Card, PageBody, PageHeader } from '../components/ui';
import { plural } from '../lib/format';
import usePageTitle from '../lib/usePageTitle';

const SAATRU_URL = import.meta.env.VITE_SAATRU_URL || 'http://localhost:5173';

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

/**
 * A quick look inside the export before it is sent, mirroring what the
 * server accepts — so a wrong file is caught here rather than after an upload.
 */
async function inspectExport(file) {
  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return { ok: false, text: 'This is not valid JSON.' };
  }
  let doc = raw;
  for (let i = 0; i < 3 && doc && typeof doc === 'object' && !Array.isArray(doc.chunks) && typeof doc.markdown !== 'string'; i += 1) {
    doc = doc.document ?? doc.result ?? doc.data;
  }
  if (!doc || typeof doc !== 'object') return { ok: false, text: 'This JSON is not a SaatruAI export.' };
  const chunks = Array.isArray(doc.chunks) ? doc.chunks : [];
  const hasText = (typeof doc.markdown === 'string' && doc.markdown.trim()) || chunks.some((c) => c?.markdown || c?.text);
  if (!hasText) return { ok: false, text: 'This export has no text in it — if the PDF is a scan, run OCR in SaatruAI first.' };

  const pages = doc.pageCount ?? doc.stats?.pageCount ?? 1;
  const parts = [plural(chunks.length, 'block'), plural(pages, 'page')];
  if (doc.classification?.label) parts.push(doc.classification.label.replace(/_/g, ' '));
  return { ok: true, text: `Looks good — ${parts.join(' · ')}`, filename: doc.filename || '', pages };
}

export default function NewReportPage() {
  usePageTitle('New analysis');
  const navigate = useNavigate();
  const [json, setJson] = useState(null);
  const [jsonCheck, setJsonCheck] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [pdfPages, setPdfPages] = useState(undefined);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setJsonCheck(null);
    if (json) inspectExport(json).then((result) => { if (!cancelled) setJsonCheck(result); });
    return () => { cancelled = true; };
  }, [json]);

  useEffect(() => {
    let cancelled = false;
    setPdfPages(undefined);
    if (pdf) countPdfPages(pdf).then((count) => { if (!cancelled) setPdfPages(count); });
    return () => { cancelled = true; };
  }, [pdf]);

  // The boxes in the JSON are placed by page, so the PDF must have the same pages.
  const pdfCheck = !pdf || pdfPages === undefined
    ? null
    : pdfPages === null
      ? { ok: false, tone: 'error', text: 'This PDF could not be opened.' }
      : jsonCheck?.ok && pdfPages !== jsonCheck.pages
        ? { ok: false, tone: 'error', text: `${plural(pdfPages, 'page')}, but the JSON describes ${jsonCheck.pages}. Use the annotated PDF from the same SaatruAI document.` }
        : { ok: true, tone: 'success', text: `${plural(pdfPages, 'page')}${jsonCheck?.ok ? ' — matches the JSON' : ''}` };

  const busy = progress !== null;
  const canSubmit = json && jsonCheck?.ok && pdf && pdfCheck?.ok && !busy;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setError('');
    setProgress(0);
    try {
      const report = await api.uploadReport({ json, pdf, title: title.trim() }, setProgress);
      navigate(`/reports/${report.id}`);
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  };

  // SaatruAI names it "<name>-annotated.pdf"; anything else may be a different report.
  const baseName = (name) => name.toLowerCase().replace(/\.pdf$/, '').replace(/-annotated$/, '');
  const pdfMismatch = pdf && jsonCheck?.filename && baseName(pdf.name) !== baseName(jsonCheck.filename);
  const pdfStatus = pdfCheck && !pdfCheck.ok
    ? pdfCheck
    : pdfMismatch
      ? { tone: 'warning', text: `The export was made from "${jsonCheck.filename}" — make sure this is the same report.` }
      : pdfCheck;

  return (
    <PageBody maxWidth={1180}>
      <PageHeader
        eyebrow="New analysis"
        title="Analyse a report"
        subtitle="Bring the JSON and the annotated PDF from SaatruAI. One PDF can hold several reports — MediThink splits it into separate documents and reads each one on its own."
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Card component="form" onSubmit={submit} sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack spacing={3}>
              <Step number={1} title="The SaatruAI export" caption="Required — this is what MediThink reads.">
                <FileDrop
                  icon={DataObjectRoundedIcon}
                  title="JSON export"
                  hint="Drop the .json here, or click to choose"
                  accept=".json,application/json"
                  extensions={['.json']}
                  file={json}
                  onFile={setJson}
                  disabled={busy}
                  badge={<Chip size="small" label="Required" sx={{ bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }} />}
                  status={jsonCheck ? { tone: jsonCheck.ok ? 'success' : 'error', text: jsonCheck.text } : null}
                />
              </Step>

              <Step number={2} title="The annotated PDF" caption="Required — SaatruAI → Download → Annotated PDF. It is split per document and each value is shown on it.">
                <FileDrop
                  icon={PictureAsPdfOutlinedIcon}
                  title="Report PDF"
                  hint="Drop the .pdf here, or click to choose"
                  accept=".pdf,application/pdf"
                  extensions={['.pdf']}
                  file={pdf}
                  onFile={setPdf}
                  disabled={busy}
                  badge={<Chip size="small" label="Required" sx={{ bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.main' }} />}
                  status={pdfStatus ? { tone: pdfStatus.tone, text: pdfStatus.text } : null}
                />
              </Step>

              <Step number={3} title="Title" caption="Optional — filled in from the documents if you leave it.">
                <TextField
                  label="Title"
                  placeholder="Detected from the documents"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  disabled={busy}
                  fullWidth
                  slotProps={{ htmlInput: { maxLength: 160 }, inputLabel: { shrink: true } }}
                />
              </Step>

              {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}

              <Divider />

              <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
                <Box sx={{ flex: 1 }}>
                  {busy ? (
                    <Stack spacing={0.75}>
                      <LinearProgress variant={progress < 1 ? 'determinate' : 'indeterminate'} value={progress * 100} />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Starting the analysis…'}
                      </Typography>
                    </Stack>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      The JSON text is sent to the analysis model — first to split it into documents, then to read each one. The PDF is never sent.
                    </Typography>
                  )}
                </Box>
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!canSubmit}
                  startIcon={<AutoAwesomeRoundedIcon />}
                >
                  Analyse report
                </Button>
              </Stack>
            </Stack>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2.5}>
            <Card sx={{ p: 2.75 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <LightbulbOutlinedIcon sx={{ fontSize: 19, color: 'warning.main' }} />
                <Typography variant="h6">Which file does what?</Typography>
              </Stack>
              <FileRole
                icon={DataObjectRoundedIcon}
                title="JSON — what is read"
                body="SaatruAI has already turned the PDF into text, tables and reading order, with a box for every block. Reading that is faster and more accurate than reading the PDF again, and the boxes are what let each value be traced."
              />
              <FileRole
                icon={PictureAsPdfOutlinedIcon}
                title="Annotated PDF — what is shown"
                body="Not read and never sent to the model. Its pages must match the JSON. It is cut into one PDF per document and drawn beside the results, so a click on any value highlights the exact line on the page."
              />
              <FileRole
                icon={CallSplitRoundedIcon}
                title="One PDF, several reports"
                body="An echo, an ECG, a prescription and a lab report scanned together are found and read separately. Reports of the same kind are put in date order."
              />
            </Card>

            <Card sx={{ p: 2.75, background: 'linear-gradient(120deg, #12b6fd0f, #4c4bec0f)' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>Getting the JSON</Typography>
              <Box component="ol" sx={{ pl: 2.5, my: 0, '& li': { mb: 0.75, fontSize: 14, color: 'text.secondary' } }}>
                <li>Open SaatruAI and upload the report PDF.</li>
                <li>When it is parsed, open <b>Download</b>.</li>
                <li>Download <b>JSON</b> and <b>Annotated PDF</b>, and drop both here.</li>
              </Box>
              <Button
                href={SAATRU_URL}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                endIcon={<OpenInNewRoundedIcon />}
                sx={{ mt: 1.5 }}
              >
                Open SaatruAI
              </Button>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </PageBody>
  );
}

function Step({ number, title, caption, children }) {
  return (
    <Box>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1.5 }}>
        <Box
          sx={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'linear-gradient(120deg, #12b6fd, #4c4bec)', color: '#fff',
            fontSize: 13, fontWeight: 700,
          }}
        >
          {number}
        </Box>
        <Box>
          <Typography variant="subtitle1" sx={{ lineHeight: 1.3 }}>{title}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{caption}</Typography>
        </Box>
      </Stack>
      {children}
    </Box>
  );
}

function FileRole({ icon: Icon, title, body }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ mb: 1.75 }}>
      <Icon sx={{ fontSize: 20, color: 'primary.main', mt: 0.25 }} />
      <Box>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{body}</Typography>
      </Box>
    </Stack>
  );
}
