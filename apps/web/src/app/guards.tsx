import { Box, CircularProgress } from '@mui/material';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth';

type Role = 'admin' | 'volunteer' | 'field_coordinator';

interface RequireAuthProps {
  /** One role, or any of several — field coordinators share the admin shell. */
  role?: Role | readonly Role[];
  children: ReactNode;
}

/** Where each role calls home — the wrong-door redirect target. */
function homeOf(role: Role): string {
  return role === 'volunteer' ? '/app/dashboard' : '/admin/dashboard';
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

  const allowed: readonly Role[] | undefined =
    role === undefined ? undefined : Array.isArray(role) ? role : [role as Role];

  if (status === 'anonymous' || !user) {
    const loginPath = allowed && !allowed.includes('volunteer') ? '/admin/login' : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  if (allowed && !allowed.includes(user.role)) {
    // Wrong door: an authenticated volunteer opening /admin lands on their own
    // dashboard rather than a bare 403, and vice versa.
    return <Navigate to={homeOf(user.role)} replace />;
  }

  return <>{children}</>;
}

/**
 * Admin-only pocket inside the shared admin/coordinator shell: Reports,
 * Trainings, and every catalog-mutation form. A field coordinator landing
 * here is sent back to the dashboard, mirroring the API's @Roles('admin').
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user && user.role !== 'admin') return <Navigate to="/admin/dashboard" replace />;
  return <>{children}</>;
}
