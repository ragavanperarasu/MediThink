import { useEffect, useState } from 'react';
import { Box, Grid, Skeleton, Stack, Typography } from '@mui/material';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import * as api from '../api';
import { plural } from '../lib/format';
import { fonts } from '../theme';
import { Card, IconTile } from './ui';

/**
 * The four numbers across the profile's reports: analysed, results read, out
 * of range, questions answered. Loads again whenever `refresh` changes — the
 * Reports page passes its list, so the numbers follow an analysis as it runs.
 */
export default function ReportStats({ refresh }) {
  const [totals, setTotals] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    api.fetchStats(controller.signal)
      .then((s) => setTotals(s.totals))
      .catch(() => {});
    return () => controller.abort();
  }, [refresh]);

  const cards = [
    {
      icon: DescriptionOutlinedIcon,
      label: 'Reports analysed',
      value: totals?.ready,
      hint: totals ? `${plural(totals.reports, 'report')} uploaded` : '',
    },
    {
      icon: ScienceOutlinedIcon,
      label: 'Results read',
      value: totals?.values,
      hint: 'measured values extracted',
    },
    {
      icon: WarningAmberRoundedIcon,
      label: 'Out of range',
      value: totals?.flagged,
      hint: totals ? `across ${plural(totals.reportsWithFlags, 'report')}` : '',
      tone: '#dc2626',
    },
    {
      icon: ForumOutlinedIcon,
      label: 'Questions answered',
      value: totals?.questions,
      hint: 'with page citations',
      tone: '#4c4bec',
    },
  ];

  return (
    <Grid container spacing={1.5} sx={{ mb: 2 }}>
      {cards.map((card) => (
        <Grid key={card.label} size={{ xs: 6, md: 3 }}>
          {totals ? (
            <SmallStat {...card} value={(card.value ?? 0).toLocaleString()} />
          ) : (
            <Skeleton variant="rounded" height={58} sx={{ borderRadius: '10px' }} />
          )}
        </Grid>
      ))}
    </Grid>
  );
}

/** One number in a slim card: icon, value, label. The hint shows on hover. */
function SmallStat({ icon, label, value, hint, tone = '#2f7cf7' }) {
  return (
    <Card title={hint} sx={{ px: 1.5, py: 1.25 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <IconTile icon={icon} size={32} color={tone} bg={`${tone}14`} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 18, lineHeight: 1.2, color: tone === '#2f7cf7' ? 'text.primary' : tone }}>
            {value}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }} noWrap>{label}</Typography>
        </Box>
      </Stack>
    </Card>
  );
}
