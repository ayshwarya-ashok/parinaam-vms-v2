import {
  AppBar,
  Box,
  Breadcrumbs,
  Button,
  Container,
  Drawer,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useMatches, useNavigate } from 'react-router-dom';
import { Alert } from '@mui/material';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const matches = useMatches();
  const navigate = useNavigate();
  const location = useLocation();
  const dynamicTrail = useBreadcrumbTrail();

  const home = variant === 'admin' ? '/admin/dashboard' : '/app/dashboard';

  /*
   * Below this width the pills go behind a hamburger. The two shells have
   * different appetites — nine admin sections need more room than seven
   * volunteer ones — so the breakpoint follows the variant rather than
   * forcing the volunteer shell into a menu it does not need.
   */
  const navBreakpoint = variant === 'admin' ? 'lg' : 'md';

  const isActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(`${to}/`);
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

  const { logout, user } = useAuth();
  const pendingReview = variant === 'volunteer' && user?.volunteer?.registrationStatus === 'pending';

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true }); // the public impact page
  };

  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="sticky">
        {/*
          nowrap is what keeps the sticky breadcrumbs honest: their top offset
          assumes a single-row app bar, and a wrapped second line of nav pills
          used to make the bar taller than the offset, sliding the crumbs
          underneath it. On narrow screens the nav scrolls sideways instead.
        */}
        {/*
          One row at every width — the sticky breadcrumbs' offset depends on
          it. Wide screens show the pills inline; narrow ones fold them into a
          drawer behind the hamburger, which stays friendlier than a sideways
          scroll nobody discovers.
        */}
        <Toolbar sx={{ gap: 1.5, flexWrap: 'nowrap' }}>
          <IconButton
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(true)}
            sx={{ color: '#fff', display: { xs: 'inline-flex', [navBreakpoint]: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/*
            The wordmark is the first nav item and behaves like one: it goes
            home, for whichever home this session has.
          */}
          <Button
            component={RouterLink}
            to={home}
            aria-label="Parinaam — go to dashboard"
            sx={{
              px: 1,
              mr: 1,
              borderRadius: 2,
              flexShrink: 0,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
            }}
          >
            <Box
              component="img"
              src="/parinaam-logo-dark.svg"
              alt="Parinaam"
              sx={{ height: 34, display: 'block' }}
            />
          </Button>

          <Box
            sx={{
              display: { xs: 'none', [navBreakpoint]: 'flex' },
              gap: 0.5,
              flexWrap: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
          >
            {nav.map((item) => {
              const active = isActive(item.to);
              return (
                <Button
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  size="small"
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                    fontWeight: active ? 700 : 500,
                    bgcolor: active ? 'rgba(255,255,255,0.16)' : 'transparent',
                    borderRadius: 999,
                    px: 1.5,
                    position: 'relative',
                    '&::after': active
                      ? {
                          content: '""',
                          position: 'absolute',
                          left: '28%',
                          right: '28%',
                          bottom: 2,
                          height: 2,
                          borderRadius: 2,
                          bgcolor: 'secondary.main',
                        }
                      : undefined,
                    '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.12)' },
                  }}
                >
                  {item.label}
                </Button>
              );
            })}
          </Box>

          {/* Spacer when the pills are folded away, so Logout stays right-aligned. */}
          <Box sx={{ flex: 1, display: { xs: 'block', [navBreakpoint]: 'none' } }} />

          <Button
            size="small"
            sx={{
              color: 'rgba(255,255,255,0.75)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              px: 2,
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
            onClick={handleLogout}
          >
            Logout
          </Button>
        </Toolbar>
      </AppBar>

      {/* The folded nav. Same destinations, same active state, one per row. */}
      <Drawer
        anchor="left"
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        PaperProps={{ sx: { width: 260, bgcolor: '#1F2B36', color: '#fff' } }}
      >
        <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
          <Box component="img" src="/parinaam-logo-dark.svg" alt="Parinaam" sx={{ height: 40, display: 'block' }} />
        </Box>
        <List sx={{ px: 1 }}>
          {nav.map((item) => {
            const active = isActive(item.to);
            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                sx={{
                  borderRadius: 2,
                  mb: 0.25,
                  color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                  bgcolor: active ? 'rgba(255,255,255,0.14)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
                }}
              >
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ fontSize: '0.92rem', fontWeight: active ? 700 : 500 }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      {crumbs.length > 0 && (
        <Box
          sx={{
            // Sticks directly under the app bar, which is itself sticky —
            // on a long roster the way back should never scroll away.
            position: 'sticky',
            top: { xs: 56, sm: 64 },
            zIndex: (t) => t.zIndex.appBar - 1,
            bgcolor: 'rgba(251,246,236,0.92)',
            backdropFilter: 'blur(8px)',
            borderBottom: '1px solid rgba(31,43,54,0.08)',
          }}
        >
        <Container maxWidth="xl" sx={{ py: 1.25 }}>
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
        </Box>
      )}

      {pendingReview && (
        <Container maxWidth="xl" sx={{ pt: 2 }}>
          <Alert severity="info" sx={{ borderRadius: 3 }}>
            Your registration is being reviewed by our team. You can explore sessions and complete
            your trainings meanwhile — enrolling opens up once you are approved, and we will email
            you either way.
          </Alert>
        </Container>
      )}
      <Outlet />
    </Box>
  );
}
