import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { LANGUAGES } from '../lib/languages';

/** Every answer language: its own script first, its English name under it. */
export default function LanguageList({ value, onChoose }) {
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
