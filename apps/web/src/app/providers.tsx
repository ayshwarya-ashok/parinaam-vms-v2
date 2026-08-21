import { CssBaseline, GlobalStyles, IconButton, ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider, closeSnackbar } from 'notistack';
import type { ReactNode } from 'react';
import { neutralToastStyles, theme } from '@/theme';
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
        <GlobalStyles styles={neutralToastStyles} />
        {/*
          Top-right: the actions that raise these toasts (save, approve, send)
          live in the top-right of every screen, so the confirmation appears
          where the eye already is instead of the opposite corner.
        */}
        <SnackbarProvider
          maxSnack={3}
          autoHideDuration={3200}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          // "No changes to save" is not information, a warning or a success —
          // it is the absence of an outcome, so it gets a neutral grey (see
          // neutralToastStyles) rather than a blue competing with the two
          // toasts that do report one.
          iconVariant={{ info: '' }}
          // Dismissable: a toast that has been read should not have to be
          // waited out, and an error worth reading twice should not vanish
          // because the timer ran while it was being read.
          action={(key) => (
            <IconButton
              size="small"
              aria-label="Dismiss notification"
              onClick={() => closeSnackbar(key)}
              sx={{ color: 'inherit', opacity: 0.8, '&:hover': { opacity: 1 } }}
            >
              ✕
            </IconButton>
          )}
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
