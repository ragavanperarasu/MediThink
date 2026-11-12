import { createContext, useContext, useMemo } from 'react';
import { Box, Link, Tooltip } from '@mui/material';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fonts } from '../theme';
import { STATUS_WORDS } from '../lib/languages';

/**
 * What a citation resolves against. Provided once per report page, so every
 * piece of Markdown on it — summary, answers — links into the same source.
 */
export const CitationContext = createContext({ chunks: [], onCite: null });

/*
 * "[C12]" and "[C3, C5]" become links to "#cite-C12" — but not "[C12](…)",
 * which is already a link. "[D3]" is a whole report, cited by the Assistant
 * when it answers across several.
 */
const CITATION = /\[((?:[CD]\d{1,5}\s*[,;]\s*)*[CD]\d{1,5})\](?!\()/g;

const linkCitations = (text) =>
  text.replace(CITATION, (_, refs) =>
    refs
      .split(/[,;]/)
      .map((ref) => `[${ref.trim()}](#cite-${ref.trim()})`)
      .join(''),
  );

/** The summary's sections, each with its own colour and icon. */
const SECTIONS = [
  { match: /^in short/i, icon: InfoOutlinedIcon, color: '#2f7cf7' },
  { match: /^needs attention/i, icon: ErrorOutlineRoundedIcon, color: '#dc2626' },
  { match: /^looks okay/i, icon: CheckCircleOutlineRoundedIcon, color: '#16a34a' },
  { match: /^food ideas/i, icon: RestaurantRoundedIcon, color: '#d97706' },
  { match: /^questions for/i, icon: HelpOutlineRoundedIcon, color: '#7c3aed' },
];

const textOf = (children) => (Array.isArray(children) ? children.map(textOf).join('') : typeof children === 'string' ? children : '');

function SectionHeading({ level, children }) {
  const section = SECTIONS.find((s) => s.match.test(textOf(children).trim()));
  const Tag = `h${level}`;
  if (!section) return <Tag>{children}</Tag>;
  const Icon = section.icon;
  return (
    <Box component={Tag} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: `${section.color} !important` }}>
      <Icon sx={{ fontSize: 20 }} />
      {children}
    </Box>
  );
}

/*
 * A table cell reading just Low, High, Normal or Abnormal — in English or in
 * any answer language (lib/languages.js) — becomes a coloured tag.
 */
const STATUS_COLOR = { low: '#d97706', high: '#dc2626', abnormal: '#dc2626', normal: '#16a34a' };

function StatusCell({ children }) {
  // "குறைவு (low)" still counts: whatever is in brackets is left out.
  const word = textOf(children).replace(/\s*\(.*\)\s*$/, '').trim();
  const color = STATUS_COLOR[STATUS_WORDS.get(word.toLowerCase())];
  if (!color) return children;
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1, py: '1px', borderRadius: 99, bgcolor: `${color}14`, color, fontWeight: 650, fontSize: 12, whiteSpace: 'nowrap' }}>
      {word}
    </Box>
  );
}

/** Markdown with the report's citations turned into page pins. */
export default function EvidenceMarkdown({ content, dense = false }) {
  const { chunks, onCite } = useContext(CitationContext);
  const byRef = useMemo(() => new Map(chunks.map((chunk) => [chunk.ref, chunk])), [chunks]);
  const source = useMemo(() => linkCitations(String(content ?? '')), [content]);

  const components = useMemo(
    () => ({
      h2: ({ children }) => <SectionHeading level={2}>{children}</SectionHeading>,
      h3: ({ children }) => <SectionHeading level={3}>{children}</SectionHeading>,
      // Tables scroll sideways inside a rounded frame instead of widening the page.
      table: ({ children }) => (
        <Box className="mt-table" sx={{ my: 1.5, overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', WebkitOverflowScrolling: 'touch' }}>
          <table>{children}</table>
        </Box>
      ),
      td: ({ children }) => <td><StatusCell>{children}</StatusCell></td>,
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
        // Words in a table wrap only between words — never "Haemo / globin";
        // a table too wide for the screen scrolls sideways in its frame.
        '& table': { borderCollapse: 'collapse', width: '100%', fontSize: '0.8125rem', lineHeight: 1.4, wordBreak: 'normal', overflowWrap: 'normal' },
        // Left-aligned throughout, whatever alignment the model wrote into the table.
        '& th, & td': { px: 1, py: 0.875, textAlign: 'left !important', verticalAlign: 'middle', borderBottom: '1px solid #eef2f7' },
        '& th:first-of-type, & td:first-of-type': { pl: 1.5 },
        '& th:last-of-type, & td:last-of-type': { pr: 1.5 },
        '& tr:last-of-type td': { borderBottom: 0 },
        '& th': { bgcolor: '#f8fafc', fontWeight: 650, color: 'text.secondary', fontSize: '0.75rem' },
        '& td:first-of-type': { fontWeight: 600, minWidth: 96 },
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
  if (chunk.kind === 'report') return <ReportPin source={chunk} onCite={onCite} />;
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

/**
 * A whole report, cited in an answer across several. The pin shows just its
 * date (the name when it has none) to keep answers uncluttered; the full name
 * is in its tooltip. It opens the report.
 */
function ReportPin({ source, onCite }) {
  const label = [source.title, source.date].filter(Boolean).join(' · ');
  const short = source.date || source.title;
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onCite?.(source)}
      aria-label={`Open ${label}`}
      title={label}
      sx={{
        display: 'inline-flex', alignItems: 'center', gap: '3px',
        verticalAlign: 'baseline', maxWidth: 140,
        mx: '2px', px: '6px', py: 0, height: 18,
        border: 0, borderRadius: '6px',
        bgcolor: 'rgba(47,124,247,0.1)', color: 'primary.dark',
        fontFamily: fonts.body, fontSize: 11, fontWeight: 650, lineHeight: '18px',
        cursor: 'pointer', position: 'relative', top: '-1px',
        '&:hover': { bgcolor: 'primary.main', color: '#fff' },
        '& svg': { fontSize: 11, flexShrink: 0 },
      }}
    >
      <DescriptionRoundedIcon />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{short}</Box>
    </Box>
  );
}
