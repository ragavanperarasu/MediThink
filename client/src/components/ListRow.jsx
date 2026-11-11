import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';

/*
 * One clickable line in a list — the shape the Reports library and an
 * upload's documents share, so both read the same way: an icon, a title, one
 * quiet line under it, and a pill only when something needs a look.
 */

export function ListRow({ icon: Icon, color, title, subtitle, pill, meta, onClick, dense = false }) {
  return (
    <Box
      component="li"
      role="link"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => event.key === 'Enter' && onClick?.()}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.75,
        px: { xs: 2, sm: 2.5 }, py: dense ? 1.25 : 1.75,
        cursor: 'pointer',
        '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'grey.100' },
        '&:hover': { bgcolor: 'grey.50' },
        '&:hover .mt-chevron': { color: 'primary.main', transform: 'translateX(2px)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
      }}
    >
      <Box
        sx={{
          width: 38, height: 38, borderRadius: '8px', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          bgcolor: `${color}14`, color,
          '& svg': { fontSize: 20 },
        }}
      >
        <Icon />
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{title}</Typography>
        {subtitle && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>{subtitle}</Typography>
        )}
      </Box>

      {pill}

      {meta && (
        <Typography
          variant="caption"
          sx={{ color: 'text.disabled', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' }, minWidth: 64, textAlign: 'right' }}
        >
          {meta}
        </Typography>
      )}
      <ChevronRightRoundedIcon className="mt-chevron" sx={{ fontSize: 20, color: 'grey.400', transition: 'all 150ms' }} />
    </Box>
  );
}

export function ListRows({ children }) {
  return <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>{children}</Box>;
}

/** "Reading", "Failed" or "4 flagged" — and nothing at all when all is well. */
export function StatePill({ status, flagged = 0 }) {
  if (status === 'analysing' || status === 'uploaded') {
    return (
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'primary.main' }}>
        <CircularProgress size={12} thickness={5} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Reading</Typography>
      </Stack>
    );
  }
  if (status === 'failed') {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'error.main' }}>
        <ErrorOutlineRoundedIcon sx={{ fontSize: 15 }} />
        <Typography variant="caption" sx={{ fontWeight: 600 }}>Failed</Typography>
      </Stack>
    );
  }
  if (flagged > 0) {
    return (
      <Box
        sx={{
          px: 1, py: 0.25, borderRadius: 99, flexShrink: 0,
          bgcolor: 'rgba(220,38,38,0.08)', color: '#dc2626',
          fontSize: 12, fontWeight: 650, whiteSpace: 'nowrap',
        }}
      >
        {flagged} flagged
      </Box>
    );
  }
  return null;
}
