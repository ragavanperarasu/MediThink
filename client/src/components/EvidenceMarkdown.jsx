import { createContext, useContext, useMemo } from 'react';
import { Box, Link, Tooltip } from '@mui/material';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fonts } from '../theme';

/**
 * What a citation resolves against. Provided once per report page, so every
 * piece of Markdown on it — summary, answers — links into the same source.
 */
export const CitationContext = createContext({ chunks: [], onCite: null });

/*
 * "[C12]" and "[C3, C5]" become links to "#cite-C12" — but not "[C12](…)",
 * which is already a link.
 */
const CITATION = /\[((?:C\d{1,5}\s*[,;]\s*)*C\d{1,5})\](?!\()/g;

const linkCitations = (text) =>
  text.replace(CITATION, (_, refs) =>
    refs
      .split(/[,;]/)
      .map((ref) => `[${ref.trim()}](#cite-${ref.trim()})`)
      .join(''),
  );

/** Markdown with the report's citations turned into page pins. */
export default function EvidenceMarkdown({ content, dense = false }) {
  const { chunks, onCite } = useContext(CitationContext);
  const byRef = useMemo(() => new Map(chunks.map((chunk) => [chunk.ref, chunk])), [chunks]);
  const source = useMemo(() => linkCitations(String(content ?? '')), [content]);

  const components = useMemo(
    () => ({
      a({ href, children }) {
        if (href?.startsWith('#cite-')) {
          const chunk = byRef.get(href.slice(6));
          // A citation to a block that does not exist is dropped, not shown as a broken pin.
          return chunk ? <CitePin chunk={chunk} onCite={onCite} /> : null;
        }
        return (
          <Link href={href} target="_blank" rel="noopener noreferrer" underline="hover">
            {children}
          </Link>
        );
      },
    }),
    [byRef, onCite],
  );

  return (
    <Box
      sx={{
        fontSize: dense ? '0.875rem' : '0.9375rem',
        lineHeight: 1.7,
        color: 'text.primary',
        wordBreak: 'break-word',
        '& > :first-of-type': { mt: 0 },
        '& > :last-child': { mb: 0 },
        '& p': { my: 1 },
        '& h1, & h2, & h3, & h4': {
          fontFamily: fonts.body, fontWeight: 650, letterSpacing: '-0.01em',
          mt: 2.5, mb: 1, lineHeight: 1.35,
        },
        '& h1': { fontSize: '1.15rem' },
        '& h2': { fontSize: '1.08rem' },
        '& h3': { fontSize: '1rem', color: 'primary.dark' },
        '& h4': { fontSize: '0.95rem' },
        '& ul, & ol': { pl: 2.75, my: 1 },
        '& li': { my: 0.5 },
        '& li::marker': { color: 'primary.main' },
        '& strong': { fontWeight: 650 },
        '& code': {
          fontFamily: fonts.mono, fontSize: '0.85em', bgcolor: 'grey.100', px: 0.5, borderRadius: 1,
        },
        '& table': {
          borderCollapse: 'collapse', width: '100%', my: 1.5, fontSize: '0.8125rem',
          display: 'block', overflowX: 'auto',
        },
        '& th, & td': { border: 1, borderColor: 'grey.200', px: 1.25, py: 0.75, textAlign: 'left' },
        '& th': { bgcolor: 'grey.50', fontWeight: 650 },
        '& blockquote': { borderLeft: 3, borderColor: 'primary.light', pl: 2, ml: 0, color: 'text.secondary' },
        '& hr': { border: 0, borderTop: 1, borderColor: 'divider', my: 2 },
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </Box>
  );
}

function CitePin({ chunk, onCite }) {
  const preview = chunk.text.replace(/[|#*_>-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140);
  return (
    <Tooltip
      arrow
      title={
        <Box>
          <Box sx={{ fontWeight: 700, mb: 0.25 }}>Page {chunk.page + 1} · {chunk.type.replace(/_/g, ' ')}</Box>
          <Box sx={{ opacity: 0.85 }}>{preview}{chunk.text.length > 140 ? '…' : ''}</Box>
        </Box>
      }
    >
      <Box
        component="button"
        type="button"
        onClick={() => onCite?.(chunk)}
        aria-label={`Show the source on page ${chunk.page + 1}`}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: '2px',
          verticalAlign: 'baseline',
          mx: '2px', px: '5px', py: 0, height: 18,
          border: 0, borderRadius: '6px',
          bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.dark',
          fontFamily: fonts.body, fontSize: 11, fontWeight: 650, lineHeight: '18px',
          cursor: 'pointer',
          position: 'relative', top: '-1px',
          '&:hover': { bgcolor: 'primary.main', color: '#fff' },
          '& svg': { fontSize: 11 },
        }}
      >
        <PlaceRoundedIcon />
        p.{chunk.page + 1}
      </Box>
    </Tooltip>
  );
}
