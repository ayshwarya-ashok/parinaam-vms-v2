import { Box, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', py: 6, color: 'text.secondary' }}>
      <Typography sx={{ fontSize: '1.05rem' }}>{message}</Typography>
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
