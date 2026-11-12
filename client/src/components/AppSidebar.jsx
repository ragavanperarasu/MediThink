import { useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Box, Divider, Drawer, ListItemIcon, Menu, MenuItem, Stack, Typography,
} from '@mui/material';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import { MedicalReportOutlinedIcon } from './icons';
import NoteAddOutlinedIcon from '@mui/icons-material/NoteAddOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LogoutIcon from '@mui/icons-material/Logout';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useAuth } from '../auth/AuthContext';
import { MediThinkMark } from '../brand/Logo';
import { ProfileAvatar, relationLabel } from './profiles';
import { APP_LAYOUT } from '../lib/layout';

export const SIDEBAR_WIDTH = 236;
export const SIDEBAR_COLLAPSED_WIDTH = 68;
/** Radius of the page's inward curve beside the rail; App.jsx uses it too. */
export const PAGE_CORNER = 20;

/** Everything on the rail is white at varying strength; ink colours vanish on blue. */
const ON_BLUE = {
  text: '#ffffff',
  soft: 'rgba(255,255,255,0.78)',
  hover: 'rgba(255,255,255,0.12)',
  active: 'rgba(255,255,255,0.22)',
  line: 'rgba(255,255,255,0.22)',
};

const RAIL_PAPER = {
  width: SIDEBAR_WIDTH,
  boxSizing: 'border-box',
  bgcolor: 'primary.main',
  color: ON_BLUE.text,
  borderRight: 0,
};

/*
 * `match` decides when an item is current. Reports covers every report page
 * except New analysis, which has its own item — a plain prefix match would
 * light both.
 */
const PRIMARY = [
  { label: 'Dashboard', to: '/dashboard', icon: SpaceDashboardOutlinedIcon, match: (p) => p === '/dashboard' },
  { label: 'Reports', to: '/reports', icon: MedicalReportOutlinedIcon, match: (p) => p.startsWith('/reports') && p !== '/reports/new' },
  { label: 'Assistant', to: '/ask', icon: SmsOutlinedIcon, match: (p) => p.startsWith('/ask') },
  { label: 'New analysis', to: '/reports/new', icon: NoteAddOutlinedIcon, match: (p) => p === '/reports/new' },
];

/**
 * The desktop navigation, in the SaatruAI pattern: an icon rail that widens
 * over the page on hover.
 */
export default function AppSidebar() {
  // Hold the rail open while the account menu is, so its anchor stays put.
  const [held, setHeld] = useState(false);

  // Phones and iPads use the bottom bar (MobileNav.jsx) instead.
  return (
    <Drawer
      variant="permanent"
      open
      sx={{
        display: 'block',
        [APP_LAYOUT]: { display: 'none' },
        width: SIDEBAR_COLLAPSED_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          ...RAIL_PAPER,
          width: held ? SIDEBAR_WIDTH : SIDEBAR_COLLAPSED_WIDTH,
          overflow: 'visible',
          transition: 'width 200ms ease',
          '& .rail-label': {
            opacity: held ? 1 : 0,
            transition: 'opacity 150ms ease',
            whiteSpace: 'nowrap',
          },
          // Corner pieces that carry the page's inward curve along the
          // rail's edge as it widens, so it never bulges outward.
          '&::before, &::after': {
            content: '""',
            position: 'absolute',
            left: '100%',
            width: PAGE_CORNER,
            height: PAGE_CORNER,
            pointerEvents: 'none',
          },
          '&::before': {
            top: 0,
            background: (t) => `radial-gradient(circle at 100% 100%, transparent ${PAGE_CORNER - 0.5}px, ${t.palette.primary.main} ${PAGE_CORNER}px)`,
          },
          '&::after': {
            bottom: 0,
            background: (t) => `radial-gradient(circle at 100% 0, transparent ${PAGE_CORNER - 0.5}px, ${t.palette.primary.main} ${PAGE_CORNER}px)`,
          },
          '&:hover, &:has(:focus-visible)': {
            width: SIDEBAR_WIDTH,
            '& .rail-label': { opacity: 1 },
          },
        },
      }}
    >
      <Box sx={{ height: '100%', overflowX: 'hidden', overflowY: 'auto' }}>
        <SidebarContent onMenuToggle={setHeld} />
      </Box>
    </Drawer>
  );
}

function SidebarContent({ onNavigate, onMenuToggle }) {
  const { pathname } = useLocation();
  return (
    <Stack sx={{ height: '100%', px: 1.5, py: 2 }}>
      <Brand onNavigate={onNavigate} />

      <Stack spacing={0.25}>
        {PRIMARY.map(({ match, ...link }) => (
          <NavItem key={link.to} {...link} active={match(pathname)} onNavigate={onNavigate} />
        ))}
      </Stack>

      <Box sx={{ flexGrow: 1 }} />


      <AccountPanel onMenuToggle={onMenuToggle} />
    </Stack>
  );
}

/** The mark on a white tile so it keeps its gradient against the blue. */
function Brand({ onNavigate }) {
  return (
    <Box
      component={RouterLink}
      to="/dashboard"
      onClick={onNavigate}
      aria-label="MediThink dashboard"
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25,
        px: 0.75, pb: 2.25, mb: 1.5,
        borderBottom: 1, borderColor: ON_BLUE.line,
        textDecoration: 'none', color: ON_BLUE.text,
      }}
    >
      <Box
        sx={{
          width: 32, height: 32, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          bgcolor: '#ffffff', borderRadius: 2,
        }}
      >
        <MediThinkMark size={25} />
      </Box>
      <Typography
        className="rail-label"
        component="span"
        sx={{
          fontFamily: '"Comfortaa", system-ui, sans-serif',
          fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1,
        }}
      >
        MediThink
      </Typography>
    </Box>
  );
}

function NavItem({ label, to, href, icon: Icon, active, onNavigate }) {
  const link = href
    ? { component: 'a', href, target: '_blank', rel: 'noopener noreferrer' }
    : { component: RouterLink, to };
  return (
    <Box
      {...link}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 1.5, py: 1.1, borderRadius: 2,
        textDecoration: 'none',
        fontSize: '0.9rem', fontWeight: 600,
        color: ON_BLUE.text,
        bgcolor: active ? ON_BLUE.active : 'transparent',
        '& svg': { fontSize: 20 },
        '&:hover': { bgcolor: active ? ON_BLUE.active : ON_BLUE.hover },
      }}
    >
      <Icon sx={{ flexShrink: 0 }} />
      <span className="rail-label">{label}</span>
    </Box>
  );
}

/** The account at the foot of the rail — where sign-out lives. */
function AccountPanel({ onMenuToggle }) {
  const { user, profile, profiles, chooseProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchorState] = useState(null);

  if (!user || !profile) return null;

  const switchTo = async (id) => {
    setAnchor(null);
    if (id === profile.id) return;
    await chooseProfile(id);
    navigate('/dashboard');
  };

  const setAnchor = (element) => {
    setAnchorState(element);
    onMenuToggle?.(Boolean(element));
  };

  const handleSignOut = async () => {
    setAnchor(null);
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <Stack spacing={1.5}>
      <Divider sx={{ borderColor: ON_BLUE.line }} />
      <Stack
        direction="row"
        spacing={1.25}
        role="button"
        tabIndex={0}
        aria-label="Account menu"
        onClick={(event) => setAnchor(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setAnchor(event.currentTarget);
          }
        }}
        sx={{
          alignItems: 'center',
          px: 1, py: 1,
          borderRadius: 2,
          cursor: 'pointer',
          '&:hover': { bgcolor: ON_BLUE.hover },
        }}
      >
        <ProfileAvatar profile={profile} size={30} sx={{ border: '2px solid #fff' }} />
        <Stack className="rail-label" sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography sx={{ fontSize: 13.5, fontWeight: 650, lineHeight: 1.3 }} noWrap>
            {profile.name}
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: ON_BLUE.soft, lineHeight: 1.3 }} noWrap>
            {user.email || `@${user.username}`}
          </Typography>
        </Stack>
        <MoreHorizIcon className="rail-label" sx={{ fontSize: 18, color: ON_BLUE.soft, flexShrink: 0 }} />
      </Stack>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { minWidth: 200, borderRadius: 2.5 } } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2">{user.displayName}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {user.email || `@${user.username}`}
          </Typography>
        </Box>
        <Divider />
        <Typography variant="caption" sx={{ px: 2, pt: 1, pb: 0.5, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
          Switch profile
        </Typography>
        {profiles.map((p) => (
          <MenuItem key={p.id} onClick={() => switchTo(p.id)} selected={p.id === profile.id} sx={{ gap: 1.5, py: 0.9 }}>
            <ProfileAvatar profile={p} size={26} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{p.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{relationLabel(p.relation)}</Typography>
            </Box>
          </MenuItem>
        ))}
        <Divider />
        <MenuItem onClick={() => { setAnchor(null); navigate('/profile'); }} sx={{ py: 1.15 }}>
          <ListItemIcon><PersonOutlineRoundedIcon fontSize="small" /></ListItemIcon>
          <Typography variant="body2">Manage profiles</Typography>
        </MenuItem>
        <MenuItem onClick={handleSignOut} sx={{ py: 1.15 }}>
          <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
          <Typography variant="body2">Sign out</Typography>
        </MenuItem>
      </Menu>
    </Stack>
  );
}
