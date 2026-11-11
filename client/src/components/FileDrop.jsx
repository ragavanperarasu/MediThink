import { useRef, useState } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { formatBytes } from '../lib/format';

/**
 * A drop zone for one file. Clicking, Enter/Space and dropping all pick a
 * file; `accept` filters the picker and is re-checked on drop, because a
 * dropped file never went through the picker's filter.
 */
export default function FileDrop({
  icon: Icon, title, hint, accept, extensions, file, onFile, status, disabled, badge,
}) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState('');

  const take = (picked) => {
    if (!picked) return;
    const ok = extensions.some((ext) => picked.name.toLowerCase().endsWith(ext));
    if (!ok) {
      setRejected(`${picked.name} is not a ${extensions.join(' or ')} file.`);
      return;
    }
    setRejected('');
    onFile(picked);
  };

  const open = () => !disabled && inputRef.current?.click();
  const tone = status?.tone === 'error' || rejected ? 'error' : file ? 'success' : 'primary';
  const toneColor = { error: '#dc2626', success: '#16a34a', primary: '#2f7cf7' }[tone];

  return (
    <Box
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${title}: ${file ? file.name : 'choose a file'}`}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (!disabled) take(event.dataTransfer.files?.[0]);
      }}
      sx={{
        position: 'relative',
        border: '1.5px dashed',
        borderColor: over ? 'primary.main' : file ? `${toneColor}66` : 'grey.300',
        bgcolor: over ? 'rgba(47,124,247,0.06)' : file ? `${toneColor}08` : '#fbfcfe',
        borderRadius: 3,
        p: 2.5,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'border-color 150ms, background-color 150ms',
        opacity: disabled ? 0.6 : 1,
        '&:hover': disabled ? {} : { borderColor: 'primary.main', bgcolor: 'rgba(47,124,247,0.04)' },
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box
          sx={{
            width: 46, height: 46, borderRadius: 2.5, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            bgcolor: `${toneColor}14`, color: toneColor,
            '& svg': { fontSize: 24 },
          }}
        >
          <Icon />
        </Box>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontSize: 15 }}>{title}</Typography>
            {badge}
          </Stack>
          {file ? (
            <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
              {file.name} <Box component="span" sx={{ color: 'text.secondary' }}>· {formatBytes(file.size)}</Box>
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{hint}</Typography>
          )}
          {(rejected || status?.text) && (
            <Typography
              variant="caption"
              sx={{
                color: rejected || status?.tone === 'error' ? 'error.main' : status?.tone === 'warning' ? 'warning.main' : 'success.main',
                display: 'block',
                mt: 0.25,
              }}
            >
              {rejected || status.text}
            </Typography>
          )}
        </Box>
        {file && !disabled && (
          <Tooltip title="Remove">
            <IconButton
              size="small"
              aria-label="Remove file"
              onClick={(event) => {
                event.stopPropagation();
                setRejected('');
                onFile(null);
              }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </Box>
  );
}
