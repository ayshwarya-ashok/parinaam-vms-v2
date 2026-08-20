import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import type { ReactNode } from 'react';
import { theme } from '@/theme';
import { AuthProvider } from './auth';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineBanner } from '@/components/OfflineBanner';

import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/source-serif-4/600.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Business conflicts (409) and auth failures are answers, not flakes.
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider
          maxSnack={3}
          autoHideDuration={2800}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <ErrorBoundary>
            <OfflineBanner />
            <AuthProvider>{children}</AuthProvider>
          </ErrorBoundary>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
