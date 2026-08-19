import {
  AppBar,
  Box,
  Breadcrumbs,
  Button,
  Container,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Outlet, useMatches } from 'react-router-dom';

interface RouteHandle {
  crumb?: string;
}

interface NavItem {
  label: string;
  to: string;
}

interface AppLayoutProps {
  variant: 'volunteer' | 'admin';
  nav: NavItem[];
}

/**
 * Shared authenticated shell: ink app bar, nav pills, and a breadcrumb strip
 * driven by route handles — the replacement for the prototype's hand-patched
 * BREADCRUMBS map.
 */
export function AppLayout({ variant, nav }: AppLayoutProps) {
  const matches = useMatches();
  const crumbs = matches
    .map((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .filter((c): c is string => Boolean(c));

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky">
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography
            variant="overline"
            sx={{ color: 'secondary.main', fontSize: '0.8rem', mr: 2, whiteSpace: 'nowrap' }}
          >
            Parinaam {variant === 'admin' ? 'Admin' : 'VMS'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
            {nav.map((item) => (
              <Button
                key={item.to}
                component={RouterLink}
                to={item.to}
                size="small"
                sx={{
                  color: 'rgba(255,255,255,0.75)',
                  borderRadius: 999,
                  px: 1.5,
                  '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' },
                }}
              >
                {item.label}
              </Button>
            ))}
          </Box>
          <Button
            size="small"
            sx={{
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              px: 2,
            }}
            // Wired to AuthContext.logout in Phase 1.
            onClick={() => undefined}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {crumbs.length > 0 && (
        <Container maxWidth="xl" sx={{ pt: 2 }}>
          <Breadcrumbs separator="›" sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>
            {crumbs.map((crumb) => (
              <Typography key={crumb} sx={{ fontSize: 'inherit', color: 'inherit' }}>
                {crumb}
              </Typography>
            ))}
          </Breadcrumbs>
        </Container>
      )}

      <Outlet />
    </Box>
  );
}
