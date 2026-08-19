import { Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}

/** The prototype's info-stat tile: uppercase label, large value, muted sub-line. */
export function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.75)' }}>
      <Typography
        sx={{
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'text.secondary',
          mb: 0.5,
        }}
      >
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1.3rem', fontWeight: 700 }}>{value}</Typography>
      {sub && (
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mt: 0.25 }}>
          {sub}
        </Typography>
      )}
    </Paper>
  );
}
