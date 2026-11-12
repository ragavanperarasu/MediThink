import { Link as RouterLink, useLocation } from 'react-router-dom';
import { Box, Stack } from '@mui/material';
import Logo from '../brand/Logo';
import {
  FeatherHome, FeatherHomeFilled, FeatherMessage, FeatherMessageFilled, FeatherPlus,
  FeatherReport, FeatherReportFilled, FeatherUser, FeatherUserFilled,
} from './icons';
import { tokens } from '../theme';
import { APP_LAYOUT } from '../lib/layout';

/* Phone and iPad chrome: a slim bar on top, a tab bar docked at the bottom. */

export const TOP_BAR_HEIGHT = 52;
/** The top bar's full height, including the phone's notch / camera area. */
export const TOP_SPACE = `calc(${TOP_BAR_HEIGHT}px + env(safe-area-inset-top, 0px))`;
export const BOTTOM_NAV_HEIGHT = 64;
export const BOTTOM_SPACE = `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;
const UPLOAD_SIZE = 44;
/** Its own colour, so the main action stands apart from the blue tabs. */
const UPLOAD_COLOR = '#12235c';
/** Centred in the bar, level with the other tabs. */
const UPLOAD_DROP = (BOTTOM_NAV_HEIGHT - UPLOAD_SIZE) / 2;
/** Width of the middle slot that holds the button. */
const CRADLE = 80;
const LABEL_GAP = 4;
const LABEL_LINE = 14;

const TABS = {
  home: { label: 'Home', to: '/dashboard', icon: FeatherHome, activeIcon: FeatherHomeFilled, match: (p) => p === '/dashboard' },
  reports: { label: 'Reports', to: '/reports', icon: FeatherReport, activeIcon: FeatherReportFilled, match: (p) => p.startsWith('/reports') && p !== '/reports/new' },
  assistant: { label: 'Assistant', to: '/ask', icon: FeatherMessage, activeIcon: FeatherMessageFilled, match: (p) => p.startsWith('/ask') },
  profile: { label: 'Profile', to: '/profile', icon: FeatherUser, activeIcon: FeatherUserFilled, match: (p) => p.startsWith('/profile') },
};

export function MobileTopBar() {
  return (
    <Stack
      direction="row"
      sx={{
        display: 'none',
        [APP_LAYOUT]: { display: 'flex' },
        alignItems: 'center',
        // The bar grows by the notch / camera area, so the logo is never under it.
        boxSizing: 'border-box',
        height: TOP_SPACE,
        px: 2,
        pt: 'env(safe-area-inset-top, 0px)',
        position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar,
        bgcolor: 'rgba(247,249,252,0.88)',
        backdropFilter: 'saturate(180%) blur(14px)',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box component={RouterLink} to="/dashboard" aria-label="MediThink home" sx={{ display: 'flex', textDecoration: 'none' }}>
        <Logo size={24} />
      </Box>
    </Stack>
  );
}

export function MobileBottomNav() {
  const { pathname } = useLocation();
  const tab = (key) => <Tab key={key} {...TABS[key]} active={TABS[key].match(pathname)} />;
  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        display: 'none',
        [APP_LAYOUT]: { display: 'block' },
        position: 'fixed', left: 0, right: 0, bottom: 0,
        zIndex: (t) => t.zIndex.appBar + 1,
        bgcolor: '#fff',
        // A 1px line along the top; no shadow.
        borderTop: '1px solid #e2e8f0',
      }}
    >
      {/* On a wide iPad the tabs stay grouped in the middle rather than spread edge to edge. */}
      <Stack direction="row" sx={{ height: BOTTOM_NAV_HEIGHT, maxWidth: 640, mx: 'auto' }}>
        <Stack direction="row" sx={{ flex: 1, bgcolor: '#fff' }}>{tab('home')}{tab('reports')}</Stack>
        <UploadCradle />
        <Stack direction="row" sx={{ flex: 1, bgcolor: '#fff' }}>{tab('assistant')}{tab('profile')}</Stack>
      </Stack>
      <Box sx={{ height: 'env(safe-area-inset-bottom, 0px)', bgcolor: '#fff' }} />
    </Box>
  );
}

/** Icon and name; the selected tab turns blue with a filled icon. */
function Tab({ label, to, icon, activeIcon, active }) {
  // Outline normally; filled when selected.
  const Icon = active ? activeIcon : icon;
  return (
    <Box
      component={RouterLink}
      to={to}
      aria-label={label}
      title={label}
      aria-current={active ? 'page' : undefined}
      sx={{
        flex: 1,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: `${LABEL_GAP}px`,
        textDecoration: 'none',
        color: active ? 'primary.main' : tokens.ink[400],
        transition: 'color 150ms',
        WebkitTapHighlightColor: 'transparent',
        '& svg': { fontSize: 24 },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -8, borderRadius: 3 },
      }}
    >
      <Icon />
      <Label>{label}</Label>
    </Box>
  );
}

function Label({ children }) {
  return (
    <Box component="span" sx={{ fontSize: 11, fontWeight: 600, lineHeight: `${LABEL_LINE}px`, letterSpacing: '0.01em' }}>
      {children}
    </Box>
  );
}

/** The middle of the bar: the Upload button, a plain navy circle, centred. */
function UploadCradle() {
  return (
    <Box sx={{ width: CRADLE, flexShrink: 0, position: 'relative', bgcolor: '#fff' }}>
      <Box
        component={RouterLink}
        to="/reports/new"
        aria-label="Upload"
        title="Upload"
        sx={{
          position: 'absolute',
          left: '50%',
          top: UPLOAD_DROP,
          width: UPLOAD_SIZE, height: UPLOAD_SIZE,
          ml: `${-UPLOAD_SIZE / 2}px`,
          borderRadius: '50%',
          display: 'grid', placeItems: 'center',
          color: '#fff',
          bgcolor: UPLOAD_COLOR,
          WebkitTapHighlightColor: 'transparent',
          '&:focus-visible': { outline: '3px solid rgba(18,35,92,0.3)', outlineOffset: 3 },
          '& svg': { fontSize: 24 },
        }}
      >
        <FeatherPlus />
      </Box>
    </Box>
  );
}
