import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import EvidenceMarkdown from './EvidenceMarkdown';
import { flagInfo } from '../lib/values';
import { fonts } from '../theme';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOMS = [1, 1.25, 1.5, 2];
/** Breathing room around a highlighted box, as a fraction of the page. */
const PAD = 0.004;

/**
 * The original PDF with the evidence drawn on it.
 *
 * `focus` is the thing being looked at ({ page, box, ref, label }); the view
 * turns to its page, scrolls it into sight and outlines it. `markers` are the
 * other values on the page, drawn faintly and clickable.
 *
 * `pages` says which of the upload's pages the file at `url` holds, in order,
 * when it is one document split from the upload; focus and markers keep the
 * upload's own page numbers and are mapped here. Null means the whole upload.
 *
 * Without a PDF it falls back to the block's text, so a citation is never a
 * dead end — just a less visual one.
 */
export default function SourceViewer({ url, pages = null, focus, markers = [], onSelectMarker, chunks = [], height = '100%' }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const [size, setSize] = useState(null);
  const [rendering, setRendering] = useState(false);

  const scrollerRef = useRef(null);
  const canvasRef = useRef(null);

  /** The upload's page number → the page in this file, or -1 when it is not in it. */
  const toLocal = useCallback((uploadPage) => (pages ? pages.indexOf(uploadPage) : uploadPage), [pages]);
  const focusPage = focus && Number.isInteger(focus.page) ? toLocal(focus.page) : -1;

  // Open the document.
  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setPdf(null);
    setError('');
    const task = pdfjs.getDocument({ url, withCredentials: true });
    task.promise.then(
      (doc) => { if (!cancelled) setPdf(doc); },
      (err) => { if (!cancelled) setError(err?.message || 'Could not open the PDF.'); },
    );
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  // Follow the focus to its page; a new file opens on the focus or its first page.
  useEffect(() => {
    if (focusPage >= 0) setPage(focusPage);
  }, [focus, focusPage]);
  useEffect(() => {
    setPage(focusPage >= 0 ? focusPage : 0);
    // Only when the file changes — the effect above follows the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Track the available width, so the page always fits it.
  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [url]);

  // Draw the page.
  useEffect(() => {
    if (!pdf || width <= 0) return undefined;
    let cancelled = false;
    let renderTask = null;
    setRendering(true);

    (async () => {
      const pageIndex = Math.min(Math.max(page, 0), pdf.numPages - 1);
      const pdfPage = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const cssWidth = width * ZOOMS[zoomIndex];
      const scale = cssWidth / base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = pdfPage.getViewport({ scale: scale * ratio });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      setSize({ w: cssWidth, h: base.height * scale });
      renderTask = pdfPage.render({ canvasContext: canvas.getContext('2d'), viewport });
      await renderTask.promise;
    })()
      .catch((err) => {
        if (!cancelled && err?.name !== 'RenderingCancelledException') setError(err?.message || 'Could not draw the page.');
      })
      .finally(() => { if (!cancelled) setRendering(false); });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, page, width, zoomIndex]);

  // Bring the focused box into view once its page is drawn.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !size || !focus?.box || focusPage !== page) return;
    const top = focus.box.t * size.h - scroller.clientHeight / 3;
    const left = focus.box.l * size.w - scroller.clientWidth / 4;
    scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: 'smooth' });
  }, [focus, focusPage, size, page]);

  const pageCount = pdf?.numPages ?? 0;
  const focusChunk = focus?.ref ? chunks.find((c) => c.ref === focus.ref) : null;

  if (!url) {
    return (
      <Stack sx={{ height, minHeight: 0 }}>
        <ViewerBar title="Source" />
        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          {focusChunk ? (
            <Stack spacing={1.5}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Page {focusChunk.page + 1} · {focusChunk.type.replace(/_/g, ' ')} · block {focusChunk.ref}
              </Typography>
              <Box sx={{ border: 2, borderColor: 'primary.main', borderRadius: 2.5, p: 2, bgcolor: 'rgba(47,124,247,0.04)' }}>
                <EvidenceMarkdown content={focusChunk.text} />
              </Box>
            </Stack>
          ) : (
            <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 6, color: 'text.secondary' }}>
              <PictureAsPdfOutlinedIcon sx={{ fontSize: 40, color: 'grey.400' }} />
              <Typography variant="body2" sx={{ maxWidth: 300 }}>
                Select a result or a citation to see the text it came from.
              </Typography>
            </Stack>
          )}
          <Alert severity="info" sx={{ mt: 3 }}>
            No PDF was uploaded with this report, which older uploads allowed. Upload it again with its annotated PDF to see every value highlighted on its page.
          </Alert>
        </Box>
      </Stack>
    );
  }

  const onPage = markers.filter((m) => m.box && Number.isInteger(m.page) && toLocal(m.page) === page);

  return (
    <Stack sx={{ height, minHeight: 0 }}>
      <ViewerBar title="Source">
        <Tooltip title="Previous page">
          <span>
            <IconButton size="small" aria-label="Previous page" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="caption" sx={{ fontWeight: 600, minWidth: 64, textAlign: 'center', fontFeatureSettings: '"tnum"' }}>
          {pageCount ? `Page ${page + 1} / ${pageCount}` : 'Loading…'}
          {pages && pageCount > 0 && pages[page] !== undefined && (
            <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{` · p.${pages[page] + 1} of upload`}</Box>
          )}
        </Typography>
        <Tooltip title="Next page">
          <span>
            <IconButton size="small" aria-label="Next page" disabled={!pageCount || page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRightRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Box sx={{ width: 8 }} />
        <Tooltip title="Zoom out">
          <span>
            <IconButton size="small" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((z) => z - 1)}>
              <ZoomOutRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Zoom in">
          <span>
            <IconButton size="small" aria-label="Zoom in" disabled={zoomIndex === ZOOMS.length - 1} onClick={() => setZoomIndex((z) => z + 1)}>
              <ZoomInRoundedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Open the PDF in a new tab">
          <IconButton size="small" aria-label="Open PDF" component="a" href={url} target="_blank" rel="noopener noreferrer">
            <OpenInNewRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </ViewerBar>

      <Box ref={scrollerRef} sx={{ flex: 1, minHeight: 0, overflow: 'auto', bgcolor: '#fff' }}>
        {error ? (
          <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>
        ) : (
          <Box
            sx={{
              position: 'relative',
              width: size?.w ?? '100%',
              height: size?.h ?? 400,
              mx: 'auto',
              bgcolor: '#fff',
            }}
          >
            <Box component="canvas" ref={canvasRef} sx={{ display: 'block', width: '100%', height: '100%' }} />

            {onPage.map((marker) => {
              const active = focus?.key === marker.key;
              if (active) return null;
              const color = flagInfo(marker.flag).color;
              return (
                <Tooltip key={marker.key} title={marker.label} arrow>
                  <Box
                    role="button"
                    aria-label={marker.label}
                    onClick={() => onSelectMarker?.(marker)}
                    sx={{
                      ...boxPosition(marker.box),
                      border: '1.5px solid', borderColor: `${color}80`, bgcolor: `${color}0d`,
                      borderRadius: '4px', cursor: 'pointer',
                      '&:hover': { borderColor: color, bgcolor: `${color}1f` },
                    }}
                  />
                </Tooltip>
              );
            })}

            {focus?.box && focusPage === page && (
              <Box
                key={`${focus.key}-${focus.page}`}
                sx={{
                  ...boxPosition(focus.box),
                  border: '2px solid #2f7cf7',
                  bgcolor: 'rgba(47,124,247,0.12)',
                  borderRadius: '5px',
                  pointerEvents: 'none',
                  animation: 'mtPulse 1.4s ease-out 1',
                  '@keyframes mtPulse': {
                    '0%': { boxShadow: '0 0 0 0 rgba(47,124,247,0.55)' },
                    '100%': { boxShadow: '0 0 0 14px rgba(47,124,247,0)' },
                  },
                }}
              >
                {focus.label && (
                  <Box
                    sx={{
                      position: 'absolute', bottom: '100%', left: -2, mb: '4px',
                      px: 0.75, py: 0.25, borderRadius: 1,
                      bgcolor: '#2f7cf7', color: '#fff',
                      fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                      fontFamily: fonts.body,
                      maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {focus.label}
                  </Box>
                )}
              </Box>
            )}

            {(rendering || !pdf) && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <CircularProgress size={24} />
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Stack>
  );
}

function boxPosition(box) {
  const l = Math.max(0, box.l - PAD);
  const t = Math.max(0, box.t - PAD);
  return {
    position: 'absolute',
    left: `${l * 100}%`,
    top: `${t * 100}%`,
    width: `${(Math.min(1, box.r + PAD) - l) * 100}%`,
    height: `${(Math.min(1, box.b + PAD) - t) * 100}%`,
  };
}

function ViewerBar({ title, children }) {
  return (
    <Stack
      direction="row"
      spacing={0.25}
      sx={{ alignItems: 'center', px: 2, py: 1, borderBottom: 1, borderColor: 'divider', minHeight: 52, flexShrink: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexGrow: 1 }}>
        <PictureAsPdfOutlinedIcon sx={{ fontSize: 18, color: 'primary.main' }} />
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>
      {children}
    </Stack>
  );
}
