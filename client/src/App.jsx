import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CssBaseline, IconButton, Stack } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import { theme } from './theme';
import { AuthProvider } from './auth/AuthContext';
import RequireAuth, { SessionLoading } from './auth/RequireAuth';
import Logo from './brand/Logo';
import AppSidebar, { PAGE_CORNER } from './components/AppSidebar';
import { Card, EmptyState, PageBody } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

/* The report page carries pdf.js; it is fetched the first time a report is opened. */
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const NewReportPage = lazy(() => import('./pages/NewReportPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * The signed-in frame: the blue rail, and the page set into it with its left
 * corners rounded — the SaatruAI dashboard layout. On desktop the page
 * scrolls inside its own frame so both rounded corners stay in view.
 */
function Shell() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    setNavOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: { xs: 'background.default', md: 'primary.main' } }}>
      <AppSidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: 'background.default',
          height: { md: '100vh' },
          overflowY: { md: 'auto' },
          borderTopLeftRadius: { md: PAGE_CORNER },
          borderBottomLeftRadius: { md: PAGE_CORNER },
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            px: 1, py: 0.75,
            position: 'sticky', top: 0, zIndex: (t) => t.zIndex.appBar,
            bgcolor: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <IconButton onClick={() => setNavOpen(true)} aria-label="Open navigation" size="small">
            <MenuIcon />
          </IconButton>
          <Box component={RouterLink} to="/dashboard" sx={{ display: 'flex', textDecoration: 'none' }}>
            <Logo size={24} />
          </Box>
        </Stack>

        <Box component="main">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<SessionLoading label="Loading…" />}>
              <Routes>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="reports/new" element={<NewReportPage />} />
                <Route path="reports/:id" element={<ReportPage />} />
                <Route path="reports/:id/documents/:n" element={<ReportPage />} />
                <Route path="reports/:id/compare" element={<ReportPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}

function NotFound() {
  return (
    <PageBody>
      <Card>
        <EmptyState
          icon={SearchOffRoundedIcon}
          title="Page not found"
          body="That address does not lead anywhere in MediThink."
          action={<Button component={RouterLink} to="/dashboard" variant="contained">Go to the dashboard</Button>}
        />
      </Card>
    </PageBody>
  );
}

/** Keeps one broken page from blanking the app; cleared on navigation. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error, info) {
    console.error('[MediThink] page crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <PageBody>
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => window.location.reload()}>Reload</Button>}
        >
          This page ran into a problem: {this.state.error.message}
        </Alert>
      </PageBody>
    );
  }
}
