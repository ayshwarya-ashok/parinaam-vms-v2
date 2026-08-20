import { Box, Button, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { tokens } from '@/theme';

/** Friendly 404 — with a way back, not a dead end. */
export function NotFound() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: tokens.bgGradient,
        p: 3,
      }}
    >
      <Box sx={{ textAlign: 'center', maxWidth: 460 }}>
        <Typography sx={{ fontSize: '4rem' }}>🧭</Typography>
        <Typography variant="h2" sx={{ mb: 1 }}>Page not found</Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          The link may be old, mistyped, or point at something that has since
          been removed. Nothing is broken on your side.
        </Typography>
        <Button variant="pill" component={RouterLink} to="/">
          Back to the start
        </Button>
      </Box>
    </Box>
  );
}
