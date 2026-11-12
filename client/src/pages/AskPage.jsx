import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, ButtonBase, CircularProgress, Drawer, Menu, Stack, Typography, useMediaQuery,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import LibraryBooksRoundedIcon from '@mui/icons-material/LibraryBooksRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import * as api from '../api';
import { useAuth } from '../auth/AuthContext';
import AskPanel from '../components/AskPanel';
import { CitationContext } from '../components/EvidenceMarkdown';
import { BOTTOM_SPACE, TOP_SPACE } from '../components/MobileNav';
import { CenteredNote, PageBody } from '../components/ui';
import { plural } from '../lib/format';
import { TYPE_IDS, typeInfo } from '../lib/reportTypes';
import usePageTitle from '../lib/usePageTitle';
import { APP_LAYOUT, APP_LAYOUT_QUERY } from '../lib/layout';
import { LANGUAGES, languageByCode, saveLanguage, savedLanguage } from '../lib/languages';

/**
 * The Assistant tab. Ask across all reports, or one kind of report (every
 * blood test, every ECG) — or, opened from a report's page, that one report
 * only. Each choice keeps its own thread. A citation opens what it points at.
 */
export default function AskPage() {
  usePageTitle('Assistant');
  const navigate = useNavigate();
  const phone = useMediaQuery(APP_LAYOUT_QUERY);
  const [params, setParams] = useSearchParams();

  const [uploads, setUploads] = useState(null);
  const [thread, setThread] = useState(null);
  const [error, setError] = useState('');
  const [pickerAnchor, setPickerAnchor] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [clearSlot, setClearSlot] = useState(null);
  // The language answers come back in, whatever language the question is asked in.
  const { profile } = useAuth();
  const [language, setLanguage] = useState(() => savedLanguage(profile?.id));
  const [languageAnchor, setLanguageAnchor] = useState(null);
  const [languageSheet, setLanguageSheet] = useState(false);
  const chooseLanguage = (code) => {
    setLanguage(code);
    saveLanguage(profile?.id, code);
    setLanguageAnchor(null);
    setLanguageSheet(false);
  };

  useEffect(() => {
    const controller = new AbortController();
    api.listReports({ limit: 200 }, controller.signal)
      .then(setUploads)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, []);

  // ?report=<id>&n=<n> (from a report's page) is that report alone; ?scope= otherwise; all by default.
  const scope = params.get('report')
    ? `doc:${params.get('report')}:${params.get('n') || 1}`
    : params.get('scope') || 'all';

  useEffect(() => {
    const controller = new AbortController();
    setThread(null);
    setError('');
    api.fetchThread(scope, controller.signal)
      .then(setThread)
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [scope]);

  // How many readable reports each kind has; kinds with none are not offered.
  const kinds = useMemo(() => {
    const counts = new Map();
    for (const upload of uploads ?? []) {
      for (const doc of upload.documents ?? []) {
        if (doc.status === 'ready') counts.set(doc.category, (counts.get(doc.category) ?? 0) + 1);
      }
    }
    return TYPE_IDS.filter((id) => counts.has(id)).map((id) => ({ id, count: counts.get(id) }));
  }, [uploads]);
  const total = kinds.reduce((sum, k) => sum + k.count, 0);

  const choose = (next) => {
    setPickerAnchor(null);
    setSheetOpen(false);
    setParams(next === 'all' ? {} : { scope: next }, { replace: true });
  };

  // Within one report a citation is a block on a page; across reports, a whole report.
  const cite = useCallback((chunk) => {
    if (!thread) return;
    if (chunk.kind === 'report') {
      navigate(chunk.several ? `/reports/${chunk.reportId}/documents/${chunk.n}` : `/reports/${chunk.reportId}`);
      return;
    }
    const focus = { key: `c-${chunk.ref}`, page: chunk.page, box: chunk.box, ref: chunk.ref, label: `Page ${chunk.page + 1}` };
    navigate(thread.several ? `/reports/${thread.reportId}/documents/${thread.n}` : `/reports/${thread.reportId}`, { state: { focus } });
  }, [thread, navigate]);

  const citations = useMemo(() => ({
    chunks: thread?.kind === 'doc'
      ? thread.chunks ?? []
      : (thread?.sources ?? []).map((source) => ({ ...source, kind: 'report' })),
    onCite: cite,
  }), [thread, cite]);

  const frame = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    maxWidth: 860,
    mx: 'auto',
    px: 4,
    py: 3,
    // Phone and iPad: exactly the space between the two bars, so only the thread scrolls.
    [APP_LAYOUT]: {
      height: `calc(100dvh - ${TOP_SPACE} - ${BOTTOM_SPACE})`,
      maxWidth: 'none',
      px: 0,
      py: 0,
      bgcolor: '#fff',
    },
  };

  // Nothing read yet: a quiet line of text in the middle, nothing else.
  if (uploads && total === 0 && !scope.startsWith('doc:')) {
    return (
      <PageBody>
        <CenteredNote icon={ForumOutlinedIcon} hint="Upload a report, then ask anything about it here.">
          No reports to ask about yet
        </CenteredNote>
      </PageBody>
    );
  }

  const one = scope.startsWith('doc:');
  const current = scope === 'all'
    ? { icon: LibraryBooksRoundedIcon, color: '#12235c' }
    : typeInfo(scope.startsWith('type:') ? scope.slice(5) : thread?.category);
  const list = (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0.5 }}>
      {one && thread && (
        <ScopeOption icon={current.icon} color={current.color} title={thread.label} caption="This report only" active onClick={() => { setPickerAnchor(null); setSheetOpen(false); }} />
      )}
      <ScopeOption icon={LibraryBooksRoundedIcon} color="#12235c" title="All reports" caption={plural(total, 'report')} active={scope === 'all'} onClick={() => choose('all')} />
      {kinds.map(({ id, count }) => {
        const info = typeInfo(id);
        return (
          <ScopeOption key={id} icon={info.icon} color={info.color} title={info.label} caption={plural(count, 'report')} active={scope === `type:${id}`} onClick={() => choose(`type:${id}`)} />
        );
      })}
    </Stack>
  );

  return (
    <Box sx={frame}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: 'center',
          mb: 2,
          // Phone and iPad: the picker in the middle, Clear pinned left, language right.
          [APP_LAYOUT]: { position: 'relative', justifyContent: 'center', px: 2, pt: 1.5, pb: 0.5, mb: 0, bgcolor: '#fff' },
        }}
      >
        <Typography variant="h3" component="h1" sx={{ flexShrink: 0, [APP_LAYOUT]: { display: 'none' } }}>Assistant</Typography>
        <ButtonBase
          onClick={(event) => (phone ? setSheetOpen(true) : setPickerAnchor(event.currentTarget))}
          disabled={!uploads}
          aria-label="Choose what to ask about"
          sx={{
            // As wide as its icon and name — no gap before the arrow.
            flex: '0 1 auto', minWidth: 0, height: 48, gap: 1,
            pl: 0.75, pr: 1, borderRadius: '12px',
            border: '1px solid #e2e8f0', bgcolor: '#fff', textAlign: 'left',
            ml: 'auto', maxWidth: 420,
            '&:hover': { borderColor: '#cbd5e1' },
            [APP_LAYOUT]: { ml: 0, maxWidth: 'calc(100% - 136px)' },
          }}
        >
          {/* What is being asked about: its icon and name. */}
          <Box sx={{ width: 34, height: 34, borderRadius: '9px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: `${current.color}14`, color: current.color, '& svg': { fontSize: 19 } }}>
            <current.icon />
          </Box>
          <Typography sx={{ minWidth: 0, fontWeight: 650, fontSize: 15 }} noWrap>
            {thread?.label ?? (error ? 'Choose what to ask about' : 'Loading…')}
          </Typography>
          <ExpandMoreRoundedIcon sx={{ color: 'text.secondary', ml: -0.25 }} />
        </ButtonBase>
        {/* AskPanel puts its Clear button here. */}
        <Box
          ref={setClearSlot}
          sx={{
            display: 'flex', flexShrink: 0, ml: 'auto !important', '&:empty': { display: 'none' },
            [APP_LAYOUT]: { position: 'absolute', left: 8, top: '50%', transform: 'translateY(calc(-50% + 4px))', ml: '0 !important' },
          }}
        />
        <LanguageButton
          language={language}
          onClick={(event) => (phone ? setLanguageSheet(true) : setLanguageAnchor(event.currentTarget))}
        />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2, [APP_LAYOUT]: { m: 2 } }}>{error}</Alert>}

      <Box
        sx={{
          flex: 1, minHeight: 0,
          bgcolor: '#fff',
          border: '1px solid #e2e8f0', borderRadius: '10px',
          [APP_LAYOUT]: { border: 'none', borderRadius: 0 },
          overflow: 'hidden',
          '& > .MuiStack-root': { minHeight: 0 },
        }}
      >
        {thread ? (
          <CitationContext.Provider value={citations}>
            <AskPanel thread={thread} clearSlot={clearSlot} language={language} />
          </CitationContext.Provider>
        ) : error ? null : (
          <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><CircularProgress size={24} /></Box>
        )}
      </Box>

      <Menu
        anchorEl={pickerAnchor}
        open={Boolean(pickerAnchor)}
        onClose={() => setPickerAnchor(null)}
        slotProps={{ paper: { sx: { width: 420, maxHeight: 420, borderRadius: '10px', mt: 0.5 } } }}
      >
        {list}
      </Menu>

      <Menu
        anchorEl={languageAnchor}
        open={Boolean(languageAnchor)}
        onClose={() => setLanguageAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 260, maxHeight: 460, borderRadius: '10px', mt: 0.5 } } }}
      >
        <LanguageList value={language} onChoose={chooseLanguage} />
      </Menu>

      <Drawer
        anchor="bottom"
        open={languageSheet}
        onClose={() => setLanguageSheet(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75dvh', pb: 'env(safe-area-inset-bottom, 0px)' } } }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 99, bgcolor: 'grey.300', mx: 'auto', mt: 1.25, mb: 1 }} />
        <Typography variant="subtitle1" sx={{ px: 2.5 }}>Answer in</Typography>
        <Typography variant="caption" sx={{ px: 2.5, pb: 1, display: 'block', color: 'text.secondary' }}>Ask in any language — the answer comes in this one.</Typography>
        <Box sx={{ overflowY: 'auto' }}><LanguageList value={language} onChoose={chooseLanguage} /></Box>
      </Drawer>

      <Drawer
        anchor="bottom"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75dvh', pb: 'env(safe-area-inset-bottom, 0px)' } } }}
      >
        <Box sx={{ width: 36, height: 4, borderRadius: 99, bgcolor: 'grey.300', mx: 'auto', mt: 1.25, mb: 1 }} />
        <Typography variant="subtitle1" sx={{ px: 2.5, pb: 1 }}>Ask about</Typography>
        <Box sx={{ overflowY: 'auto' }}>{list}</Box>
      </Drawer>
    </Box>
  );
}

/** One choice in the picker: all reports, a kind, or the report it was opened from. */
function ScopeOption({ icon: Icon, color, title, caption, active, onClick }) {
  return (
    <Box component="li">
      <ButtonBase
        onClick={onClick}
        sx={{
          width: '100%', justifyContent: 'flex-start', gap: 1.5, textAlign: 'left',
          px: 2, py: 1.25, borderRadius: '8px',
          bgcolor: active ? 'rgba(47,124,247,0.08)' : 'transparent',
          '&:hover': { bgcolor: active ? 'rgba(47,124,247,0.12)' : 'grey.50' },
        }}
      >
        <Box sx={{ width: 34, height: 34, borderRadius: '8px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: `${color}14`, color, '& svg': { fontSize: 19 } }}>
          <Icon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{title}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>{caption}</Typography>
        </Box>
        {active && <CheckRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />}
      </ButtonBase>
    </Box>
  );
}

/** The answer language, top right: a translate icon over the language's short name. */
function LanguageButton({ language, onClick }) {
  const lang = languageByCode(language);
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`Answer language: ${lang.name}. Change`}
      aria-haspopup="menu"
      sx={{
        width: 48, height: 48, flexShrink: 0, borderRadius: '12px', flexDirection: 'column', gap: '1px',
        border: '1px solid #e2e8f0', bgcolor: '#fff', color: language === 'en' ? 'text.secondary' : 'primary.main',
        '&:hover': { borderColor: '#cbd5e1' },
        [APP_LAYOUT]: { position: 'absolute', right: 16, top: '50%', transform: 'translateY(calc(-50% + 4px))', ml: '0 !important' },
      }}
    >
      <TranslateRoundedIcon sx={{ fontSize: 17 }} />
      <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{lang.short}</Typography>
    </ButtonBase>
  );
}

/** Every answer language: its own script first, its English name under it. */
function LanguageList({ value, onChoose }) {
  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0.5 }}>
      {LANGUAGES.map((lang) => {
        const active = lang.code === value;
        return (
          <Box component="li" key={lang.code}>
            <ButtonBase
              onClick={() => onChoose(lang.code)}
              lang={lang.code}
              sx={{
                width: '100%', justifyContent: 'flex-start', gap: 1.5, textAlign: 'left',
                px: 2, py: 1.1, borderRadius: '8px',
                bgcolor: active ? 'rgba(47,124,247,0.08)' : 'transparent',
                '&:hover': { bgcolor: active ? 'rgba(47,124,247,0.12)' : 'grey.50' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{lang.native}</Typography>
                {lang.code !== 'en' && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{lang.name}</Typography>}
              </Box>
              {active && <CheckRoundedIcon sx={{ fontSize: 18, color: 'primary.main' }} />}
            </ButtonBase>
          </Box>
        );
      })}
    </Stack>
  );
}
