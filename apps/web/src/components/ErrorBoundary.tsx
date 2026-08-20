import { Box, Button, Typography } from '@mui/material';
import { Component, type ReactNode } from 'react';
import { tokens } from '@/theme';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash shows an apology and a reload button
 * instead of a white page. Errors land in the console for diagnosis — this
 * boundary is UX, not telemetry.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('Unhandled render error:', error);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
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
          <Typography sx={{ fontSize: '4rem' }}>🪁</Typography>
          <Typography variant="h2" sx={{ mb: 1 }}>Something went wrong</Typography>
          <Typography sx={{ color: 'text.secondary', mb: 3 }}>
            The page hit an unexpected error. Your data is safe — reloading
            usually clears it.
          </Typography>
          <Button variant="pill" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Box>
      </Box>
    );
  }
}
