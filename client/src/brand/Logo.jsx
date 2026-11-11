import { useId } from 'react';
import { Box, Stack, Typography } from '@mui/material';

/**
 * MediThink's mark: a report page with its corner turned down, and a pulse
 * trace across it that spells the M — ending on a dot, the point being read.
 *
 * Built in SaatruAI's cyan → blue → indigo so the two products sit together:
 * SaatruAI reads the document, MediThink reads the medicine in it.
 *
 * Drawn inline so it costs no request at first paint. Gradient ids are
 * per-instance; two marks on one page with the same id would share a fill.
 */
export function MediThinkMark({ size = 32, tone = 'colour' }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const page = `mtPage-${uid}`;
  const fold = `mtFold-${uid}`;
  const mono = tone === 'mono';

  return (
    <Box
      component="svg"
      viewBox="0 0 64 64"
      role="img"
      aria-label="MediThink"
      sx={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      {!mono && (
        <defs>
          <linearGradient id={page} x1="0.08" y1="0.02" x2="0.92" y2="0.98">
            <stop offset="0" stopColor="#12b6fd" />
            <stop offset="0.45" stopColor="#2f7cf7" />
            <stop offset="1" stopColor="#4c4bec" />
          </linearGradient>
          <linearGradient id={fold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cfe2ff" />
          </linearGradient>
        </defs>
      )}

      <path
        d="M18 4H43L60 21V46A14 14 0 0 1 46 60H18A14 14 0 0 1 4 46V18A14 14 0 0 1 18 4Z"
        fill={mono ? 'currentColor' : `url(#${page})`}
      />
      <path d="M42 5.5V16.5A6 6 0 0 0 48 22.5H59Z" fill={mono ? '#000' : '#1c3fa8'} opacity={mono ? 0.25 : 0.35} />
      <path d="M43 4V15A6 6 0 0 0 49 21H60Z" fill={mono ? '#ffffff' : `url(#${fold})`} opacity={mono ? 0.75 : 1} />

      <path
        d="M10.5 39H18.5L24.5 22.5L32 44L39.5 22.5L45.5 39H49.5"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="53.8" cy="39" r="3.5" fill="#ffffff" />
    </Box>
  );
}

/** The wordmark alone: "Medi" in navy, "Think" in the ribbon blue. */
export function Wordmark({ size = 20, tone = 'colour' }) {
  const mono = tone === 'mono';
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: '"Comfortaa", system-ui, sans-serif',
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
        color: mono ? 'inherit' : '#12235c',
      }}
    >
      Medi
      <Box component="span" sx={{ color: mono ? 'inherit' : '#2f7cf7' }}>
        Think
      </Box>
    </Typography>
  );
}

/** Mark plus wordmark, optionally with the descriptor line beneath. */
export default function Logo({ size = 30, tagline = false, tone = 'colour', sx }) {
  return (
    <Stack direction="row" spacing={1.15} sx={{ alignItems: 'center', ...sx }}>
      <MediThinkMark size={size} tone={tone} />
      <Stack sx={{ lineHeight: 1 }}>
        <Wordmark size={size * 0.62} tone={tone} />
        {tagline && (
          <Typography
            component="span"
            sx={{
              fontSize: Math.max(9, size * 0.26),
              color: tone === 'mono' ? 'inherit' : 'text.secondary',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              mt: 0.25,
              opacity: tone === 'mono' ? 0.8 : 1,
            }}
          >
            Medical report analysis
          </Typography>
        )}
      </Stack>
    </Stack>
  );
}
