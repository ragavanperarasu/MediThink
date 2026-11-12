import { Component, Suspense, lazy, useEffect, useRef } from 'react';
import { Link as RouterLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Alert, Box, Button, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import SearchOffRoundedIcon from '@mui/icons-material/SearchOffRounded';
import { theme } from './theme';
import { AuthProvider, useAuth } from './auth/AuthContext';
import RequireAuth, { SessionLoading } from './auth/RequireAuth';
import AppSidebar, { PAGE_CORNER } from './components/AppSidebar';
import { BOTTOM_SPACE, MobileBottomNav, MobileTopBar } from './components/MobileNav';
import { APP_LAYOUT } from './lib/layout';
import { Card, EmptyState, PageBody } from './components/ui';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';

/* The report page carries pdf.js; it is fetched the first time a report is opened. */
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const NewReportPage = lazy(() => import('./pages/NewReportPage'));
const ReportPage = lazy(() => import('./pages/ReportPage'));
const AskPage = lazy(() => import('./pages/AskPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* Accounts are created by the first Google sign-in. */}
          <Route path="/signup" element={<Navigate to="/login" replace />} />
          <Route path="/*" element={<RequireAuth><Shell /></RequireAuth>} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * The signed-in frame. Desktop: the blue rail, and the page set into it with
 * its left corners rounded; the page scrolls inside its own frame so both
 * corners stay in view. Phone and iPad: a slim top bar and an app-style bottom bar
 * (Home · AI · Upload · Profile), with the page scrolling under both.
 */
function Shell() {
  // Every page re-mounts when the profile changes, so nothing from the
  // previous person's reports stays on screen.
  const { profile } = useAuth();
  return <ShellFrame key={profile?.id} />;
}

function ShellFrame() {
  const location = useLocation();
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'primary.main', [APP_LAYOUT]: { bgcolor: 'background.default' } }}>
      <AppSidebar />

      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: 'background.default',
          height: '100vh',
          overflowY: 'auto',
          borderTopLeftRadius: PAGE_CORNER,
          borderBottomLeftRadius: PAGE_CORNER,
          // Phones and iPads: the page scrolls as a whole under the two bars.
          [APP_LAYOUT]: {
            height: 'auto',
            overflowY: 'visible',
            borderRadius: 0,
            pb: BOTTOM_SPACE,
          },
        }}
      >
        <MobileTopBar />

        <Box component="main">
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<SessionLoading label="Loading…" />}>
              <Routes>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="ask" element={<AskPage />} />
                <Route path="profile" element={<ProfilePage />} />
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

      <MobileBottomNav />
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
