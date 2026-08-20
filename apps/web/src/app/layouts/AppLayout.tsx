import {
  AppBar,
  Box,
  Breadcrumbs,
  Button,
  Container,
  Link,
  Toolbar,
  Typography,
} from '@mui/material';
import { Link as RouterLink, Outlet, useMatches, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { BreadcrumbProvider, useBreadcrumbTrail, type Crumb } from '../breadcrumbs';

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
 * Shared authenticated shell: ink app bar, nav pills, and a clickable
 * breadcrumb strip. The strip replaces the per-page "← Back to X" buttons:
 * every ancestor crumb is a link, driven by route nesting (useMatches) plus
 * any dynamic segments a page injects via useDynamicCrumbs.
 */
export function AppLayout(props: AppLayoutProps) {
  return (
    <BreadcrumbProvider>
      <AppLayoutInner {...props} />
    </BreadcrumbProvider>
  );
}

function AppLayoutInner({ variant, nav }: AppLayoutProps) {
  const matches = useMatches();
  const navigate = useNavigate();
  const dynamicTrail = useBreadcrumbTrail();

  const home = variant === 'admin' ? '/admin/dashboard' : '/app/dashboard';
  const routeCrumbs: Crumb[] = matches
    .filter((m) => (m.handle as RouteHandle | undefined)?.crumb)
    .map((m, index) => ({
      label: (m.handle as RouteHandle).crumb!,
      // The root layout crumb ("Home"/"Admin") points at the dashboard.
      to: index === 0 ? home : m.pathname,
    }));

  // Page-supplied dynamic parents slot in just before the current page.
  const crumbs =
    routeCrumbs.length > 0
      ? [...routeCrumbs.slice(0, -1), ...dynamicTrail, routeCrumbs[routeCrumbs.length - 1]]
      : dynamicTrail;

  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

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
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {crumbs.length > 0 && (
        <Container maxWidth="xl" sx={{ pt: 2 }}>
          <Breadcrumbs
            aria-label="Breadcrumb"
            separator="›"
            sx={{ fontSize: '0.82rem', color: 'text.secondary' }}
          >
            {crumbs.map((crumb, index) =>
              index < crumbs.length - 1 && crumb.to ? (
                <Link
                  key={`${crumb.label}-${index}`}
                  component={RouterLink}
                  to={crumb.to}
                  underline="hover"
                  sx={{ fontSize: 'inherit', color: 'inherit', fontWeight: 600 }}
                >
                  {crumb.label}
                </Link>
              ) : (
                <Typography
                  key={`${crumb.label}-${index}`}
                  aria-current="page"
                  sx={{ fontSize: 'inherit', color: 'text.primary' }}
                >
                  {crumb.label}
                </Typography>
              ),
            )}
          </Breadcrumbs>
        </Container>
      )}

      <Outlet />
    </Box>
  );
}
