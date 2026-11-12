import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  IconButton, LinearProgress, ListItemIcon, Menu, MenuItem, Skeleton, Snackbar, Stack, Tab, Tabs,
  TextField, Tooltip, Typography,
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import * as api from '../api';
import EvidenceMarkdown, { CitationContext } from '../components/EvidenceMarkdown';
import SourceViewer from '../components/SourceViewer';
import { FeatherMessage } from '../components/icons';
import ValuesTable from '../components/ValuesTable';
import { ListRow, ListRows, StatePill } from '../components/ListRow';
import ComparisonView from '../components/ComparisonView';
import { Card, EmptyState, PageBody } from '../components/ui';
import { MediThinkMark } from '../brand/Logo';
import { plural } from '../lib/format';
import { typeInfo } from '../lib/reportTypes';
import { isOutOfRange } from '../lib/values';
import usePageTitle from '../lib/usePageTitle';
import { fonts, tokens } from '../theme';

export default function ReportPage() {
  const { id, n: nParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('summary');
  const [focus, setFocus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async (signal) => {
    const next = await api.fetchReport(id, signal);
    setReport(next);
    return next;
  }, [id]);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setFocus(null);
    setProgress(null);
    setError('');
    setTab('summary');
    load(controller.signal).catch((err) => {
      if (err.name !== 'AbortError') setError(err.status === 404 ? 'missing' : err.message);
    });
    return () => controller.abort();
  }, [load]);

  // Opening a document starts on its summary — unless a citation brought us
  // here, in which case the cited block is what is shown.
  useEffect(() => {
    const carried = location.state?.focus ?? null;
    setFocus(carried);
    // A carried citation opens the PDF view on the cited block.
    setTab(carried ? 'source' : 'summary');
    // Only when the document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nParam]);

  // While the report is being read, check every two seconds; reload once it is done.
  const working = report?.status === 'analysing' || report?.status === 'uploaded';
  useEffect(() => {
    if (!working) return undefined;
    const controller = new AbortController();
    let seen = '';
    const timer = setInterval(async () => {
      try {
        const { status, progress: next } = await api.fetchStatus(id, controller.signal);
        setProgress(next);
        // Reload when it finishes, and as each step lands, so the documents
        // found by the split show up while they are still being read.
        const step = `${next?.stage}:${next?.total}:${next?.done}`;
        if (status !== 'analysing' && status !== 'uploaded') await load(controller.signal);
        else if (seen && step !== seen) await load(controller.signal);
        seen = step;
      } catch { /* the next tick tries again */ }
    }, 2000);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [working, id, load]);

  /*
   * An upload holding several documents opens like a folder: the list of
   * documents, each opening on its own page with its own PDF. An upload of
   * one document opens straight on that document.
   */
  const documents = useMemo(() => report?.documents ?? [], [report?.documents]);
  const several = documents.length > 1;
  const doc = several ? documents.find((d) => String(d.n) === nParam) ?? null : documents[0] ?? null;
  const inFolder = several && !nParam;
  const comparisons = report?.comparisons ?? [];
  const comparing = inFolder && comparisons.length > 0 && location.pathname.endsWith('/compare');

  usePageTitle(inFolder || !several ? report?.title ?? 'Report' : doc?.title || 'Document');

  const rows = useMemo(() => (doc?.values ?? []).map((v, i) => ({ ...v, key: `v${i}` })), [doc?.values]);

  const selectValue = useCallback((row) => {
    setFocus({
      key: row.key,
      page: row.page,
      box: row.box,
      ref: row.source,
      label: `${row.name}: ${row.value}${row.unit ? ` ${row.unit}` : ''}`,
    });
    setTab('source');
  }, []);

  // A citation can point into another document (an answer from Ask spans the
  // upload); that document is opened, with the cited block in view.
  const cite = useCallback((chunk) => {
    const next = { key: `c-${chunk.ref}`, page: chunk.page, box: chunk.box, ref: chunk.ref, label: `Page ${chunk.page + 1}` };
    setTab('source');
    const owner = documents.find((d) => d.pages.includes(chunk.page));
    if (several && owner && owner.n !== doc?.n) {
      navigate(`/reports/${id}/documents/${owner.n}`, { state: { focus: next } });
    } else {
      setFocus(next);
    }
  }, [documents, several, doc?.n, navigate, id]);

  const citations = useMemo(() => ({ chunks: report?.chunks ?? [], onCite: cite }), [report?.chunks, cite]);

  const markers = useMemo(
    () => rows.filter((r) => r.box && Number.isInteger(r.page)).map((r) => ({
      key: r.key, page: r.page, box: r.box, flag: r.flag, label: `${r.name}: ${r.value}${r.unit ? ` ${r.unit}` : ''}`,
    })),
    [rows],
  );

  const reanalyse = async () => {
    setMenuAnchor(null);
    try {
      await api.reanalyse(id);
      setReport((r) => ({ ...r, status: 'analysing', error: '' }));
    } catch (err) {
      setToast(err.message);
    }
  };

  if (error === 'missing') {
    return (
      <PageBody>
        <Card>
          <EmptyState
            icon={SearchOffRoundedIcon}
            title="This report does not exist"
            body="It may have been deleted."
            action={<Button component={RouterLink} to="/reports" variant="contained">Back to reports</Button>}
          />
        </Card>
      </PageBody>
    );
  }

  if (!report) {
    return (
      <PageBody>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : (
          <Stack spacing={2}>
            <Skeleton width={120} />
            <Skeleton variant="rounded" height={44} sx={{ maxWidth: 520 }} />
            <Skeleton width={360} />
            <Skeleton variant="rounded" height={420} sx={{ mt: 2 }} />
          </Stack>
        )}
      </PageBody>
    );
  }

  const folderUrl = `/reports/${report.id}`;
  if (several && nParam && !doc) {
    return (
      <PageBody>
        <Card>
          <EmptyState
            icon={SearchOffRoundedIcon}
            title="This document is not in the upload"
            body="Re-analysing can change how the PDF is split. Open the upload to see its documents."
            action={<Button component={RouterLink} to={folderUrl} variant="contained">Open the upload</Button>}
          />
        </Card>
      </PageBody>
    );
  }

  const fullPdfUrl = report.source.hasPdf ? api.pdfUrl(report.id) : null;
  // The document's own PDF; the whole upload when it has none.
  const sourceUrl = doc?.hasPdf ? api.documentPdfUrl(report.id, doc.n) : fullPdfUrl;
  const sourcePages = doc?.hasPdf ? doc.pages : null;
  // The upload's own actions — re-read, rename, delete — live where the upload is shown as a whole.
  const atRoot = inFolder || !several;

  const menu = (
    <Menu
      anchorEl={menuAnchor}
      open={Boolean(menuAnchor)}
      onClose={() => setMenuAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5, borderRadius: 2.5 } } }}
    >
      {atRoot && (
        <MenuItem onClick={reanalyse} disabled={working}>
          <ListItemIcon><RefreshRoundedIcon fontSize="small" /></ListItemIcon>
          Re-analyse
        </MenuItem>
      )}
      {atRoot && (
        <MenuItem onClick={() => { setMenuAnchor(null); setEditing(true); }}>
          <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>
          Rename
        </MenuItem>
      )}
      {several && !inFolder && doc?.hasPdf && (
        <MenuItem component="a" href={sourceUrl} target="_blank" rel="noopener noreferrer" onClick={() => setMenuAnchor(null)}>
          <ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon>
          Open this document's PDF
        </MenuItem>
      )}
      {fullPdfUrl && (
        <MenuItem component="a" href={fullPdfUrl} target="_blank" rel="noopener noreferrer" onClick={() => setMenuAnchor(null)}>
          <ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon>
          {several ? 'Open the whole PDF' : 'Open PDF'}
        </MenuItem>
      )}
      <MenuItem component="a" href={api.jsonUrl(report.id)} onClick={() => setMenuAnchor(null)}>
        <ListItemIcon><DownloadOutlinedIcon fontSize="small" /></ListItemIcon>
        Download JSON
      </MenuItem>
      {atRoot && <Divider />}
      {atRoot && (
        <MenuItem onClick={() => { setMenuAnchor(null); setDeleting(true); }} sx={{ color: 'error.main' }}>
          <ListItemIcon><DeleteOutlineRoundedIcon fontSize="small" color="error" /></ListItemIcon>
          Delete upload
        </MenuItem>
      )}
    </Menu>
  );

  const actions = (
    <>
      <Tooltip title="More">
        <IconButton onClick={(event) => setMenuAnchor(event.currentTarget)} aria-label="More actions">
          <MoreVertRoundedIcon />
        </IconButton>
      </Tooltip>
      {menu}
    </>
  );

  // Back where the person came from; straight to Reports when opened by link.
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/reports'));

  const title = inFolder || !several ? report.title : doc.title || typeInfo(doc.category).label;
  const subline = inFolder
    ? [plural(documents.length, 'report'), report.reportDate].filter(Boolean).join(' · ')
    : doc?.date || report.reportDate;

  const ready = !inFolder && doc?.summary;

  return (
    <CitationContext.Provider value={citations}>
      <PageBody maxWidth={860}>
        {/* Back, the title with its date, and ⋮ — one row. */}
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 2, mx: -1, mt: { xs: -1.5, md: -2 } }}>
          <IconButton onClick={goBack} aria-label="Back">
            <ArrowBackRoundedIcon />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="h1"
              sx={{
                fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 18, sm: 20 }, lineHeight: 1.3,
                // A long name wraps to two lines at most.
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
              }}
            >
              {title}
            </Typography>
            {(subline || working) && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {subline && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{subline}</Typography>}
                {working && (
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'primary.main' }}>
                    <CircularProgress size={11} thickness={5} />
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {inFolder && progress?.total ? `Reading ${progress.done} of ${progress.total}` : 'Reading'}
                    </Typography>
                  </Stack>
                )}
              </Stack>
            )}
          </Box>
          {actions}
        </Stack>

        {report.status === 'failed' && (
          <Alert
            severity="error"
            sx={{ mb: 2.5 }}
            action={atRoot && <Button color="inherit" size="small" onClick={reanalyse}>Try again</Button>}
          >
            {report.error || 'The analysis did not finish.'}
          </Alert>
        )}

        {ready && (
          // The view switch, and Assistant — which opens the Assistant tab on this report.
          <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: 'center' }}>
            <ViewSwitch
              value={tab}
              onChange={setTab}
              options={[
                { value: 'summary', label: 'Summary' },
                { value: 'values', label: 'Results' },
                { value: 'source', label: 'PDF' },
              ]}
            />
            <Button
              variant="contained"
              startIcon={<FeatherMessage sx={{ fontSize: '18px !important' }} />}
              onClick={() => navigate(`/ask?report=${report.id}&n=${doc.n}`)}
              aria-label="Assistant"
              sx={{
                height: 44, flexShrink: 0, borderRadius: '10px', px: { xs: 1.75, sm: 2.5 }, whiteSpace: 'nowrap',
                // Small phones: the icon alone, so the switch keeps its room.
                '@media (max-width: 379.95px)': { minWidth: 44, px: 0, '& .MuiButton-startIcon': { m: 0 }, '& .mt-label': { display: 'none' } },
              }}
            >
              <span className="mt-label">Assistant</span>
            </Button>
          </Stack>
        )}

        {inFolder ? (
          <>
            {comparisons.length > 0 && (
              <Tabs
                value={comparing ? 'changes' : 'documents'}
                onChange={(_, value) => navigate(value === 'changes' ? `${folderUrl}/compare` : folderUrl, { replace: true })}
                sx={{
                  mb: 2, minHeight: 40,
                  '& .MuiTab-root': { minHeight: 40, minWidth: 0, px: 1.5, textTransform: 'none', fontWeight: 600, fontSize: 14 },
                }}
              >
                <Tab value="documents" label={`Reports ${documents.length}`} />
                <Tab value="changes" label="Changes over time" />
              </Tabs>
            )}
            {comparing ? (
              <ComparisonView
                comparisons={comparisons}
                onOpenValue={(cell, name) => navigate(`/reports/${report.id}/documents/${cell.n}`, {
                  state: {
                    focus: {
                      key: `cmp-${cell.n}-${name}`,
                      page: cell.page,
                      box: cell.box,
                      ref: cell.source,
                      label: `${name}: ${cell.value}${cell.unit ? ` ${cell.unit}` : ''}`,
                    },
                  },
                })}
              />
            ) : (
              <FolderView report={report} documents={documents} />
            )}
          </>
        ) : !doc?.summary && (working || doc?.status === 'analysing') ? (
          several ? <DocumentWaitingCard doc={doc} /> : <AnalysingCard report={report} progress={progress} />
        ) : !doc?.summary ? (
          report.status !== 'failed' && doc?.status !== 'failed' && <AnalysingCard report={report} progress={progress} />
        ) : (
          <Card sx={{ overflow: 'hidden' }}>
            {tab === 'summary' && <SummaryTab doc={doc} rows={rows} />}
            {tab === 'values' && <ValuesTable values={doc.values ?? []} selectedKey={focus?.key} onSelect={selectValue} />}
            {tab === 'source' && (
              <SourceViewer
                url={sourceUrl}
                pages={sourcePages}
                focus={focus}
                markers={markers}
                chunks={report.chunks}
                onSelectMarker={(m) => selectValue(rows.find((r) => r.key === m.key))}
                height="74vh"
              />
            )}
          </Card>
        )}

        {editing && (
          <EditDialog
            report={report}
            onClose={() => setEditing(false)}
            onSaved={(updated) => {
              setReport((r) => ({ ...r, title: updated.title }));
              setEditing(false);
              setToast('Saved.');
            }}
          />
        )}

        <DeleteDialog
          open={deleting}
          title={report.title}
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            await api.deleteReport(report.id);
            navigate('/reports', { replace: true });
          }}
        />

        <Snackbar
          open={Boolean(toast)}
          autoHideDuration={4000}
          onClose={() => setToast('')}
          message={toast}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        />
      </PageBody>
    </CitationContext.Provider>
  );
}

/** A document whose own reading has not finished yet. */
function DocumentWaitingCard({ doc }) {
  return (
    <Card sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center' }}>
      <CircularProgress size={28} />
      <Typography variant="h5" sx={{ mt: 2 }}>Still reading this document…</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {pagesLabel(doc.pages)} of the upload. The page updates by itself when it is done.
      </Typography>
    </Card>
  );
}

function AnalysingCard({ report, progress }) {
  const blocks = report.chunks?.length ?? 0;
  const documents = report.documents ?? [];
  const live = progress ?? report.progress;
  const stage = live?.stage || (documents.length ? 'analysing' : blocks ? 'splitting' : 'extracting');
  const extracting = stage === 'extracting';
  const viaLandingAI = report.source?.extractor === 'landingai';
  const steps = [
    {
      text: extracting
        ? `Reading the PDF with LandingAI${live?.done ? ` — ${live.done}%` : ''}`
        : blocks
          ? `Read ${plural(blocks, 'block')} of text and tables${viaLandingAI ? ' with LandingAI' : ''}`
          : 'Reading the PDF',
      done: !extracting && blocks > 0,
      active: extracting,
    },
    {
      text: documents.length
        ? `Split into ${plural(documents.length, 'document')}, ordered by kind and date`
        : 'Splitting the PDF into separate documents',
      done: documents.length > 0,
      active: stage === 'splitting',
    },
    {
      text: stage === 'analysing' && progress?.total
        ? `Reading each document — ${progress.done} of ${progress.total} done`
        : 'Reading each document: results, ranges and a summary',
      done: stage === 'comparing',
      active: stage === 'analysing',
    },
    { text: 'Comparing reports of the same kind over time', done: false, active: stage === 'comparing' },
  ];
  return (
    <Card sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center', background: tokens.gradientSoft }}>
      <Box
        sx={{
          display: 'inline-block',
          animation: 'mtBreath 2.2s ease-in-out infinite',
          '@keyframes mtBreath': {
            '0%, 100%': { transform: 'scale(1)' },
            '50%': { transform: 'scale(1.06)' },
          },
        }}
      >
        <MediThinkMark size={68} />
      </Box>
      <Typography variant="h4" sx={{ mt: 2.5 }}>Reading this report…</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
        Usually a minute or two — a long scan can take longer. You can leave this page; it carries on.
      </Typography>
      <LinearProgress
        variant={live?.total && (extracting || stage === 'analysing') ? 'determinate' : 'indeterminate'}
        value={live?.total ? (100 * live.done) / live.total : 0}
        sx={{ maxWidth: 380, mx: 'auto', my: 3.5 }}
      />
      <Stack spacing={1.25} sx={{ maxWidth: 440, mx: 'auto', textAlign: 'left' }}>
        {steps.map((step) => (
          <Stack key={step.text} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            {step.done ? (
              <CheckCircleRoundedIcon sx={{ fontSize: 16, color: '#16a34a' }} />
            ) : step.active ? (
              <CircularProgress size={14} />
            ) : (
              <Box sx={{ width: 6, height: 6, mx: '5px', borderRadius: '50%', bgcolor: 'grey.400', flexShrink: 0 }} />
            )}
            <Typography variant="body2" sx={{ color: step.active ? 'text.primary' : 'text.secondary', fontWeight: step.active ? 600 : 400 }}>
              {step.text}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {documents.length > 0 && (
        <Stack spacing={1} sx={{ maxWidth: 440, mx: 'auto', mt: 3, textAlign: 'left' }}>
          {documents.map((d) => (
            <DocumentLine key={d.n} doc={d} />
          ))}
        </Stack>
      )}
    </Card>
  );
}

/** One document's kind, title, date and pages, on one line. */
function DocumentLine({ doc }) {
  const info = typeInfo(doc.category);
  const Icon = info.icon;
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.7)' }}>
      <Icon sx={{ fontSize: 18, color: info.color }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{doc.title || info.label}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {[info.label, doc.date, pagesLabel(doc.pages)].filter(Boolean).join(' · ')}
        </Typography>
      </Box>
      <DocumentState doc={doc} />
    </Stack>
  );
}

function DocumentState({ doc }) {
  if (doc.status === 'analysing') return <CircularProgress size={14} />;
  if (doc.status === 'failed') return <ErrorOutlineRoundedIcon sx={{ fontSize: 17, color: 'error.main' }} />;
  if (doc.flaggedCount > 0) {
    return <Chip size="small" label={`${doc.flaggedCount} out of range`} sx={{ bgcolor: 'rgba(220,38,38,0.08)', color: '#dc2626' }} />;
  }
  return <CheckCircleRoundedIcon sx={{ fontSize: 17, color: '#16a34a' }} />;
}

/** "p.1–3" for a run of pages, "p.2, 5" otherwise — the upload's own numbering. */
function pagesLabel(pages = []) {
  if (!pages.length) return '';
  const run = pages.every((p, i) => i === 0 || p === pages[i - 1] + 1);
  if (pages.length === 1) return `p.${pages[0] + 1}`;
  return run ? `p.${pages[0] + 1}–${pages.at(-1) + 1}` : `p.${pages.map((p) => p + 1).join(', ')}`;
}

/**
 * The upload as a folder: the documents it was split into, in reading order —
 * grouped by kind, oldest first within a kind. Each row opens that document,
 * with its own summary, results and PDF.
 */
function FolderView({ report, documents }) {
  const navigate = useNavigate();
  return (
    <Card sx={{ overflow: 'hidden', borderRadius: '10px' }}>
      <ListRows>
        {documents.map((d) => {
          const info = typeInfo(d.category);
          return (
            <ListRow
              key={d.n}
              icon={info.icon}
              color={info.color}
              title={d.title || info.label}
              subtitle={[info.label, d.date, plural(d.pages.length, 'page')].filter(Boolean).join(' · ')}
              pill={<StatePill status={d.status} flagged={d.flaggedCount} />}
              onClick={() => navigate(`/reports/${report.id}/documents/${d.n}`)}
            />
          );
        })}
      </ListRows>
    </Card>
  );
}

/**
 * The summary: a count of what needs attention and what is okay, then the
 * summary itself — In short · Needs attention · Looks okay · Food ideas ·
 * Questions for your doctor.
 */
function SummaryTab({ doc, rows }) {
  if (!doc) return null;
  const out = rows.filter((r) => isOutOfRange(r.flag)).length;
  const okay = rows.filter((r) => r.flag === 'normal').length;

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {doc.status === 'failed' && <Alert severity="error" sx={{ mb: 2.5 }}>{doc.error || 'This report could not be read.'}</Alert>}

      {rows.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
          <CountPill tone="bad" count={out} label={out === 1 ? 'needs attention' : 'need attention'} />
          <CountPill tone="good" count={okay} label="normal" />
        </Stack>
      )}

      <EvidenceMarkdown content={doc.summary} />

      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 3 }}>
        Not a diagnosis. Ask your doctor what it means for you.
      </Typography>
    </Box>
  );
}

/** "2 need attention" in red, "8 normal" in green. */
function CountPill({ tone, count, label }) {
  const color = tone === 'bad' ? (count ? '#dc2626' : '#64748b') : '#16a34a';
  const Icon = tone === 'bad' ? ErrorOutlineRoundedIcon : CheckCircleRoundedIcon;
  return (
    <Stack
      direction="row"
      spacing={0.75}
      sx={{ alignItems: 'center', px: 1.25, py: 0.75, borderRadius: '10px', bgcolor: `${color}12`, color, flex: 1, minWidth: 0 }}
    >
      <Icon sx={{ fontSize: 18 }} />
      <Typography sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1 }}>{count}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>{label}</Typography>
    </Stack>
  );
}

/** Summary · Results · PDF — a segmented switch, one view at a time. */
function ViewSwitch({ value, onChange, options }) {
  return (
    <Box role="tablist" sx={{ flex: 1, minWidth: 0, display: 'flex', p: '4px', height: 44, bgcolor: '#eef2f7', borderRadius: '10px' }}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <ButtonBase
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            sx={{
              flex: 1, minWidth: 0, borderRadius: '7px',
              fontSize: 14, fontWeight: active ? 650 : 500,
              color: active ? 'text.primary' : 'text.secondary',
              bgcolor: active ? '#fff' : 'transparent',
              border: '1px solid', borderColor: active ? '#e2e8f0' : 'transparent',
              transition: 'background-color 120ms, color 120ms',
            }}
          >
            {option.label}
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function EditDialog({ report, onClose, onSaved }) {
  const [title, setTitle] = useState(report.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const updated = await api.updateReport(report.id, { title: title.trim() });
      onSaved(updated);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { component: 'form', onSubmit: save } }}>
      <DialogTitle>Edit details</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus fullWidth slotProps={{ htmlInput: { maxLength: 160 } }} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={busy || !title.trim()}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({ open, title, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Delete this report?</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          “{title}” will be removed with its uploaded files, results and questions. This cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
