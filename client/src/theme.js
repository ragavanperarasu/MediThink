import { createTheme } from '@mui/material/styles';

/**
 * Design tokens — shared with SaatruAI so the two products read as one family.
 *
 * Comfortaa is the brand voice and stays on the wordmark and display
 * headings; Inter carries everything a person actually reads.
 */
const ink = {
  900: '#0b1220',
  800: '#111a2e',
  700: '#1f2a44',
  600: '#3d4a66',
  500: '#64748b',
  400: '#94a3b8',
  300: '#cbd5e1',
  200: '#e2e8f0',
  100: '#f1f5f9',
  50: '#f8fafc',
};

export const tokens = {
  ink,
  brand: { cyan: '#12b6fd', blue: '#2f7cf7', indigo: '#4c4bec', navy: '#12235c' },
  gradient: 'linear-gradient(120deg, #12b6fd 0%, #2f7cf7 45%, #4c4bec 100%)',
  gradientSoft: 'linear-gradient(120deg, #12b6fd14 0%, #2f7cf714 45%, #4c4bec14 100%)',
  shadow: {
    sm: '0 1px 2px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.05)',
    md: '0 2px 4px rgba(15,23,42,0.04), 0 8px 16px rgba(15,23,42,0.06)',
    lg: '0 4px 8px rgba(15,23,42,0.04), 0 16px 32px rgba(15,23,42,0.08)',
    xl: '0 8px 16px rgba(15,23,42,0.05), 0 32px 64px rgba(15,23,42,0.12)',
    ring: '0 0 0 4px rgba(47,124,247,0.14)',
  },
};

const display = '"Comfortaa", system-ui, -apple-system, sans-serif';
const body = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';
const mono = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

export const fonts = { display, body, mono };

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#2f7cf7', dark: '#2a5fd8', light: '#5b9bfa', contrastText: '#fff' },
    secondary: { main: '#4c4bec', dark: '#3b3ad4', light: '#7170f2' },
    success: { main: '#16a34a' },
    warning: { main: '#d97706' },
    error: { main: '#dc2626' },
    background: { default: '#f7f9fc', paper: '#ffffff' },
    text: { primary: ink[900], secondary: ink[500], disabled: ink[400] },
    divider: ink[200],
    grey: ink,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: body,
    h1: { fontFamily: display, fontWeight: 700, fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', lineHeight: 1.08, letterSpacing: '-0.025em' },
    h2: { fontFamily: display, fontWeight: 700, fontSize: 'clamp(1.75rem, 3.4vw, 2.5rem)', lineHeight: 1.16, letterSpacing: '-0.02em' },
    h3: { fontFamily: display, fontWeight: 700, fontSize: 'clamp(1.35rem, 2.4vw, 1.75rem)', lineHeight: 1.25, letterSpacing: '-0.015em' },
    h4: { fontWeight: 650, fontSize: '1.25rem', lineHeight: 1.35, letterSpacing: '-0.01em' },
    h5: { fontWeight: 650, fontSize: '1.0625rem', lineHeight: 1.4 },
    h6: { fontWeight: 650, fontSize: '0.9375rem', lineHeight: 1.45 },
    subtitle1: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.5 },
    subtitle2: { fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.5 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.65 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5, letterSpacing: '0.005em' },
    overline: { fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.1em', lineHeight: 1.6 },
    button: { fontWeight: 600, letterSpacing: '0.005em', fontSize: '0.875rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        body: { backgroundColor: '#f7f9fc', overflowX: 'hidden' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: ink[300], borderRadius: 8, border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: ink[400] },
        '*::-webkit-scrollbar-track': { backgroundColor: 'transparent' },
        ':focus-visible': { outline: '2px solid #2f7cf7', outlineOffset: 2 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: ink[200] },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, textTransform: 'none', paddingInline: 18, paddingBlock: 9 },
        sizeLarge: { paddingInline: 26, paddingBlock: 13, fontSize: '0.9375rem' },
        sizeSmall: { paddingInline: 12, paddingBlock: 5 },
        containedPrimary: {
          boxShadow: '0 1px 2px rgba(47,124,247,0.24), 0 4px 12px rgba(47,124,247,0.22)',
          '&:hover': { boxShadow: '0 2px 4px rgba(47,124,247,0.28), 0 8px 20px rgba(47,124,247,0.3)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 7 },
        sizeSmall: { height: 22, fontSize: '0.6875rem' },
        outlined: { borderColor: ink[200] },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', minHeight: 48 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: ink[800], fontSize: '0.75rem', fontWeight: 500,
          borderRadius: 7, padding: '6px 10px',
        },
        arrow: { color: ink[800] },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10, backgroundColor: '#fff',
          '& fieldset': { borderColor: ink[200] },
          '&:hover fieldset': { borderColor: ink[300] },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: ink[100] },
        head: {
          fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: ink[500], backgroundColor: ink[50],
        },
      },
    },
    MuiAlert: { styleOverrides: { root: { borderRadius: 10, fontSize: '0.875rem' } } },
    MuiLinearProgress: { styleOverrides: { root: { borderRadius: 999, height: 6 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 16 } } },
  },
});
