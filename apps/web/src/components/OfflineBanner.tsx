import { Box, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { tokens } from '@/theme';

/** A quiet strip when the browser goes offline — forms will fail; say why. */
export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;
  return (
    <Box
      role="status"
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 2000,
        bgcolor: tokens.ink,
        color: '#fdf9f0',
        textAlign: 'center',
        py: 0.75,
      }}
    >
      <Typography sx={{ fontSize: '0.85rem' }}>
        ⚡ You appear to be offline — changes cannot be saved until the connection returns.
      </Typography>
    </Box>
  );
}
