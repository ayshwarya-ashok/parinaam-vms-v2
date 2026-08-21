import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

interface RequireAuthProps {
  role?: 'admin' | 'volunteer';
  children: ReactNode;
}

/**
 * Route gate. Unauthenticated users never see the shell — they are sent to the
 * matching login page, remembering where they were headed.
 */
export function RequireAuth({ role, children }: RequireAuthProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  // Hold rendering while the silent refresh decides whether a session exists;
  // flashing the login page at a logged-in user is worse than a spinner.
  if (status === 'loading') {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress color="secondary" />
      </Box>
    );
  }

  if (status === 'anonymous' || !user) {
    const loginPath = role === 'admin' ? '/admin/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (role && user.role !== role) {
    // Wrong door: an authenticated volunteer opening /admin lands on their own
    // dashboard rather than a bare 403, and vice versa.
    return <Navigate to={user.role === 'admin' ? '/admin/dashboard' : '/app/dashboard'} replace />;
  }

  return <>{children}</>;
}
