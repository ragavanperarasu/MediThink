import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Chip, Grid, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import NoFoodOutlinedIcon from '@mui/icons-material/NoFoodOutlined';
import MedicationRoundedIcon from '@mui/icons-material/MedicationRounded';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import BloodtypeRoundedIcon from '@mui/icons-material/BloodtypeRounded';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import PriorityHighRoundedIcon from '@mui/icons-material/PriorityHighRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { flagInfo } from '../lib/values';
import { fonts, tokens } from '../theme';
import { Card, IconTile } from './ui';

/*
 * The home page's health snapshot, gathered from every report: a banner with
 * the main concerns and blood group, then the latest results out of range,
 * medicines, allergies and food ideas. Every item opens the report it was
 * read from.
 */

const FOOD = '#16a34a';
const LESS = '#e11d48';

export default function HealthCard({ data, loading }) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Stack spacing={2.5} sx={{ mb: 2.5 }}>
        <Skeleton variant="rounded" height={170} sx={{ borderRadius: '16px' }} />
        <Grid container spacing={2.5}>
          {[6, 3, 3].map((lg, i) => (
            <Grid key={i} size={{ xs: 12, sm: i ? 6 : 12, lg }}>
              <Skeleton variant="rounded" height={170} sx={{ borderRadius: '10px' }} />
            </Grid>
          ))}
        </Grid>
      </Stack>
    );
  }
  // Nothing read yet: the Recent reports card already invites the first upload.
  if (!data?.card) return null;

  const { card } = data;
  const sources = new Map(data.sources.map((s) => [s.ref, s]));
  const open = (ref) => {
    const s = sources.get(ref);
    if (s) navigate(s.several ? `/reports/${s.reportId}/documents/${s.n}` : `/reports/${s.reportId}`);
  };
  const from = (ref) => {
    const s = sources.get(ref);
    return s ? `From ${s.title}${s.date ? ` · ${s.date}` : ''}` : '';
  };
  const ctx = { open, from, sources };

  return (
    <Stack spacing={2.5} sx={{ mb: 2.5 }}>
      <Banner card={card} {...ctx} />
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <WatchCard attention={card.attention} {...ctx} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <MedicinesCard medicines={card.medicines} {...ctx} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
          <AllergiesCard allergies={card.allergies} noAllergies={card.noAllergies} {...ctx} />
        </Grid>
      </Grid>
      <FoodCard foods={card.foods ?? []} note={card.foodNote} {...ctx} />
      {!data.complete && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          Concerns, allergies and medicines could not be read just now — they will be tried again next time.
        </Typography>
      )}
    </Stack>
  );
}

/* ── the banner ──────────────────────────────────────────────────────── */

function Banner({ card, open, from }) {
  const watch = card.attention.length;
  const headline = watch
    ? `${watch} result${watch === 1 ? '' : 's'} to keep an eye on`
    : 'Your latest results are in range';
  const meta = [`From ${card.reportCount} report${card.reportCount === 1 ? '' : 's'}`, card.lastCheck?.date && `latest ${card.lastCheck.date}`]
    .filter(Boolean).join(' · ');

  return (
    <Box
      sx={{
        position: 'relative', overflow: 'hidden', borderRadius: '16px', color: '#fff',
        background: tokens.gradient,
        p: { xs: 2.5, sm: 3.5 },
        // Two soft rings for depth, kept behind the content.
        '&::before, &::after': { content: '""', position: 'absolute', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', pointerEvents: 'none' },
        '&::before': { width: 340, height: 340, right: -90, top: -150 },
        '&::after': { width: 220, height: 220, right: 40, bottom: -150, background: 'rgba(255,255,255,0.06)' },
      }}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ position: 'relative', zIndex: 1, alignItems: { md: 'center' } }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" sx={{ opacity: 0.85, letterSpacing: 1.2 }}>Health snapshot</Typography>
          <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 22, sm: 28 }, lineHeight: 1.2, mt: 0.25 }}>
            {headline}
          </Typography>
          <Typography variant="body2" sx={{ opacity: 0.85, mt: 0.75 }}>{meta}</Typography>

          {card.concerns.length > 0 && (
            <Box sx={{ mt: 2.25 }}>
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 650, opacity: 0.85, mb: 0.75 }}>Main concerns</Typography>
              <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                {card.concerns.map((c) => (
                  <Tooltip key={c.text} title={from(c.ref)} arrow>
                    <Chip
                      label={c.text}
                      onClick={() => open(c.ref)}
                      sx={{
                        color: '#fff', fontWeight: 600, height: 32,
                        bgcolor: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)',
                        backdropFilter: 'blur(4px)',
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.26)' },
                      }}
                    />
                  </Tooltip>
                ))}
              </Stack>
            </Box>
          )}
        </Box>

        <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {card.bloodGroup && (
            <Tooltip title={from(card.bloodGroup.ref)} arrow>
              <ButtonBase
                onClick={() => open(card.bloodGroup.ref)}
                aria-label={`Blood group ${card.bloodGroup.text}`}
                sx={{
                  width: 84, height: 84, borderRadius: '50%', flexDirection: 'column',
                  bgcolor: '#fff', color: '#dc2626',
                }}
              >
                <BloodtypeRoundedIcon sx={{ fontSize: 22 }} />
                <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 20, lineHeight: 1.1 }}>{card.bloodGroup.text}</Typography>
              </ButtonBase>
            </Tooltip>
          )}
          <Button
            component={RouterLink}
            to="/ask"
            startIcon={<AutoAwesomeRoundedIcon />}
            sx={{ bgcolor: '#fff', color: 'primary.main', px: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.9)' } }}
          >
            Ask MediThink
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/* ── the cards below it ──────────────────────────────────────────────── */

function SectionHead({ icon, color, title, subtitle }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 1.75 }}>
      <IconTile icon={icon} size={34} color={color} bg={`${color}14`} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" component="h2" sx={{ fontWeight: 650, lineHeight: 1.3 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{subtitle}</Typography>}
      </Box>
    </Stack>
  );
}

const FLAG_ICON = { high: ArrowUpwardRoundedIcon, low: ArrowDownwardRoundedIcon, abnormal: PriorityHighRoundedIcon };

function WatchCard({ attention, open, from }) {
  return (
    <Card sx={{ p: 2.25, height: '100%' }}>
      <SectionHead icon={MonitorHeartOutlinedIcon} color="#c026d3" title="Keep an eye on" subtitle="Latest results outside the report's range" />
      {attention.length ? (
        <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {attention.map((v) => {
            const info = flagInfo(v.flag);
            const Icon = FLAG_ICON[v.flag] ?? PriorityHighRoundedIcon;
            return (
              <Tooltip key={`${v.section}/${v.name}`} title={[v.section, from(v.ref)].filter(Boolean).join(' · ')} arrow>
                <ButtonBase
                  onClick={() => open(v.ref)}
                  sx={{
                    display: 'block', textAlign: 'left', borderRadius: '12px', p: 1.5,
                    bgcolor: info.bg, border: `1px solid ${info.color}26`,
                    transition: 'transform 150ms', '&:hover': { transform: 'translateY(-2px)' },
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: info.color }}>
                    <Icon sx={{ fontSize: 15 }} />
                    <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{info.label}</Typography>
                  </Stack>
                  <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 24, lineHeight: 1.25, mt: 0.5, color: info.color }}>
                    {v.value}
                    {v.unit && <Box component="span" sx={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 600, ml: 0.5, opacity: 0.8 }}>{v.unit}</Box>}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }} noWrap>{v.name}</Typography>
                  {v.date && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{v.date}</Typography>}
                </ButtonBase>
              </Tooltip>
            );
          })}
        </Box>
      ) : (
        <AllClear text="Your latest results are within range" />
      )}
    </Card>
  );
}

function MedicinesCard({ medicines, open, from, sources }) {
  const prescription = sources.get(medicines[0]?.ref);
  return (
    <Card sx={{ p: 2.25, height: '100%' }}>
      <SectionHead
        icon={MedicationRoundedIcon}
        color="#2f7cf7"
        title="Medicines"
        subtitle={prescription ? `Prescription${prescription.date ? ` · ${prescription.date}` : ''}` : undefined}
      />
      {medicines.length ? (
        <Stack spacing={0.5}>
          {medicines.map((m) => (
            <Tooltip key={m.text} title={from(m.ref)} arrow placement="left">
              <ButtonBase
                onClick={() => open(m.ref)}
                sx={{ justifyContent: 'flex-start', gap: 1.25, borderRadius: '8px', px: 1, py: 0.75, textAlign: 'left', '&:hover': { bgcolor: 'grey.50' } }}
              >
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: '#2f7cf7', flexShrink: 0 }} />
                <Typography variant="body2" sx={{ fontWeight: 550 }}>{m.text}</Typography>
              </ButtonBase>
            </Tooltip>
          ))}
        </Stack>
      ) : (
        <Unknown text="No prescription read yet" />
      )}
    </Card>
  );
}

function AllergiesCard({ allergies, noAllergies, open, from }) {
  return (
    <Card sx={{ p: 2.25, height: '100%' }}>
      <SectionHead icon={NoFoodOutlinedIcon} color="#dc2626" title="Allergies" />
      {allergies.length ? (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {allergies.map((a) => (
            <Tooltip key={a.text} title={from(a.ref)} arrow>
              <Chip label={a.text} onClick={() => open(a.ref)} sx={{ fontWeight: 600, bgcolor: 'rgba(220,38,38,0.09)', color: '#dc2626' }} />
            </Tooltip>
          ))}
        </Stack>
      ) : noAllergies ? (
        <ButtonBase onClick={() => open(noAllergies)} sx={{ borderRadius: '10px', display: 'block', textAlign: 'left' }}>
          <AllClear text="No known allergies" />
        </ButtonBase>
      ) : (
        <Unknown text="Not recorded in your reports" />
      )}
    </Card>
  );
}

function AllClear({ text }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.5, borderRadius: '10px', bgcolor: 'rgba(22,163,74,0.08)', color: '#16a34a' }}>
      <CheckCircleRoundedIcon sx={{ fontSize: 20 }} />
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{text}</Typography>
    </Stack>
  );
}

function Unknown({ text }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.5, borderRadius: '10px', bgcolor: 'grey.50', color: 'text.secondary' }}>
      <HelpOutlineRoundedIcon sx={{ fontSize: 20 }} />
      <Typography variant="body2">{text}</Typography>
    </Stack>
  );
}

/* ── food ideas ──────────────────────────────────────────────────────── */

function FoodTile({ food, tone }) {
  return (
    <Box sx={{ px: 1.25, py: 1, bgcolor: '#fff', borderRadius: '10px', border: `1px solid ${tone}26` }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{food}</Typography>
    </Box>
  );
}

function FoodPanel({ label, tone, foods }) {
  return (
    <Box sx={{ flex: 1, minWidth: 0, p: 1.5, borderRadius: '12px', bgcolor: `${tone}0d` }}>
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: tone, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
        {foods.map((food) => <FoodTile key={food} food={food} tone={tone} />)}
      </Box>
    </Box>
  );
}

function FoodCard({ foods, note, open, from }) {
  return (
    <Card sx={{ p: 2.25 }}>
      <SectionHead icon={RestaurantOutlinedIcon} color={FOOD} title="Food ideas" subtitle="Everyday foods for your latest results" />
      {foods.length ? (
        <Stack spacing={2.25}>
          {foods.map((f) => (
            <Box key={f.for}>
              <Tooltip title={from(f.ref)} arrow placement="top-start">
                <Typography
                  variant="body2"
                  onClick={() => open(f.ref)}
                  sx={{ fontWeight: 650, mb: 1, cursor: 'pointer', display: 'inline-block' }}
                >
                  For {f.for.charAt(0).toLowerCase() + f.for.slice(1)}
                </Typography>
              </Tooltip>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                <Box sx={{ flex: f.less.length ? 3 : 1, minWidth: 0, display: 'flex' }}>
                  <FoodPanel label="Eat more" tone={FOOD} foods={f.eat} />
                </Box>
                {f.less.length > 0 && (
                  <Box sx={{ flex: 2, minWidth: 0, display: 'flex' }}>
                    <FoodPanel label="Have less" tone={LESS} foods={f.less} />
                  </Box>
                )}
              </Stack>
            </Box>
          ))}
          {note && <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>{note}</Typography>}
        </Stack>
      ) : (
        <AllClear text="No food changes suggested by your latest results" />
      )}
    </Card>
  );
}
