import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { typeInfo } from '../lib/reportTypes';
import { flagInfo, rangePosition } from '../lib/values';
import { tokens } from '../theme';

/* Small, shared pieces of the interface. */

/** The heading block at the top of every page. */
export function PageHeader({ eyebrow, title, subtitle, actions, children }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={2}
      sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between', mb: 3.5 }}
    >
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 0.5 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h3" component="h1" sx={{ wordBreak: 'break-word' }}>{title}</Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, maxWidth: 680 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}

/** The page's padded column. */
export function PageBody({ children, maxWidth = 1320 }) {
  return (
    <Box sx={{ px: { xs: 2, sm: 3, lg: 5 }, py: { xs: 3, md: 4.5 }, maxWidth, mx: 'auto', width: '100%' }}>
      {children}
    </Box>
  );
}

/** A white card with the product's border and soft shadow. */
export function Card({ children, sx, ...props }) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3.5, boxShadow: tokens.shadow.sm, ...sx }} {...props}>
      {children}
    </Paper>
  );
}

export function CardHeader({ title, subtitle, action, icon }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: 2.5, pt: 2.25, pb: 1.5 }}>
      {icon && <IconTile icon={icon} size={34} />}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="h6" component="h2">{title}</Typography>
        {subtitle && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

/** An icon on a soft brand-tinted square. */
export function IconTile({ icon: Icon, size = 40, color = '#2f7cf7', bg }) {
  return (
    <Box
      sx={{
        width: size, height: size, borderRadius: 2.5, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: bg ?? tokens.gradientSoft,
        color,
        '& svg': { fontSize: size * 0.5 },
      }}
    >
      <Icon />
    </Box>
  );
}

export function StatCard({ icon, label, value, hint, tone }) {
  return (
    <Card sx={{ p: 2.5, height: '100%' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <IconTile icon={icon} color={tone ?? '#2f7cf7'} bg={tone ? `${tone}14` : undefined} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{label}</Typography>
          <Typography
            sx={{ fontFamily: '"Comfortaa", sans-serif', fontWeight: 700, fontSize: 28, lineHeight: 1.2, color: tone ?? 'text.primary' }}
          >
            {value}
          </Typography>
          {hint && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{hint}</Typography>}
        </Box>
      </Stack>
    </Card>
  );
}

export function TypeChip({ type, size = 'small' }) {
  const info = typeInfo(type);
  const Icon = info.icon;
  return (
    <Chip
      size={size}
      icon={<Icon />}
      label={type === 'auto' ? 'Not detected yet' : info.label}
      sx={{
        bgcolor: `${info.color}12`,
        color: info.color,
        '& .MuiChip-icon': { color: info.color, fontSize: 15, ml: '6px' },
      }}
    />
  );
}

const STATUS = {
  ready: { label: 'Analysed', color: '#16a34a', icon: CheckCircleRoundedIcon },
  analysing: { label: 'Analysing', color: '#2f7cf7', icon: HourglassTopRoundedIcon },
  uploaded: { label: 'Queued', color: '#64748b', icon: HourglassTopRoundedIcon },
  failed: { label: 'Failed', color: '#dc2626', icon: ErrorOutlineRoundedIcon },
};

export function StatusChip({ status }) {
  const info = STATUS[status] ?? STATUS.uploaded;
  const Icon = info.icon;
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={<Icon />}
      label={info.label}
      sx={{
        color: info.color,
        borderColor: `${info.color}40`,
        bgcolor: '#fff',
        '& .MuiChip-icon': { color: info.color, fontSize: 14, ml: '6px' },
      }}
    />
  );
}

export function FlagChip({ flag }) {
  const info = flagInfo(flag);
  return (
    <Chip
      size="small"
      label={info.label}
      sx={{ bgcolor: info.bg, color: info.color, minWidth: 64 }}
    />
  );
}

/** Whether a value was found, character for character, on the page. */
export function EvidenceIcon({ verified, page }) {
  return verified ? (
    <Tooltip title={`Checked against the report${page != null ? ` — page ${page + 1}` : ''}`} arrow>
      <VerifiedOutlinedIcon sx={{ fontSize: 18, color: 'success.main' }} />
    </Tooltip>
  ) : (
    <Tooltip title="Could not find this exact figure in the report text — check it on the page" arrow>
      <HelpOutlineRoundedIcon sx={{ fontSize: 18, color: 'warning.main' }} />
    </Tooltip>
  );
}

/**
 * Where a value sits against its printed range: the middle band is the
 * range, the dot is the result. Drawn only when both are plain numbers.
 */
export function RangeBar({ value, range, flag, width = 120 }) {
  const position = rangePosition(value, range);
  if (!position) return <Box sx={{ width }} />;
  const color = flagInfo(flag).color;
  const [from, to] = position.band;
  return (
    <Tooltip title={`Reference ${range}`} arrow>
      <Box sx={{ position: 'relative', width, height: 14, flexShrink: 0 }}>
        <Box sx={{ position: 'absolute', left: 0, right: 0, top: 5, height: 4, borderRadius: 99, bgcolor: 'grey.100' }} />
        <Box
          sx={{
            position: 'absolute', top: 5, height: 4, borderRadius: 99,
            left: `${from}%`, width: `${to - from}%`, bgcolor: 'rgba(22,163,74,0.35)',
          }}
        />
        <Box
          sx={{
            position: 'absolute', top: 1, width: 12, height: 12, borderRadius: '50%',
            left: `calc(${position.at}% - 6px)`,
            bgcolor: color, border: '2px solid #fff', boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
          }}
        />
      </Box>
    </Tooltip>
  );
}

/** A friendly empty state with an optional action. */
export function EmptyState({ icon, title, body, action, sx }) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 3, ...sx }}>
      {icon && <IconTile icon={icon} size={52} />}
      <Typography variant="h5">{title}</Typography>
      {body && <Typography variant="body2" sx={{ color: 'text.secondary', maxWidth: 420 }}>{body}</Typography>}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}
