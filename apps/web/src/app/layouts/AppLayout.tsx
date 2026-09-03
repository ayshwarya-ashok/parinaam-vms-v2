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

          {/*
            Large-screen nav: full-height flat tabs, not pills. Each item spans
            the bar's height and carries a 3px indicator on the bar's bottom
            edge — brand yellow when active, a faint white hint sliding in on
            hover. No backgrounds, no rounded corners: the underline IS the
            state.
          */}
          <Box
            sx={{
              display: { xs: 'none', [navBreakpoint]: 'flex' },
              alignSelf: 'stretch',
              alignItems: 'stretch',
              gap: 0.25,
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
                    height: '100%',
                    borderRadius: 0,
                    px: 1.75,
                    letterSpacing: '0.01em',
                    color: active ? '#fff' : 'rgba(255,255,255,0.68)',
                    fontWeight: active ? 700 : 500,
                    // The whole section lights up when active — a soft white
                    // wash over the full-height tab, brightest at the base so
                    // it reads as one piece with the yellow indicator.
                    bgcolor: 'transparent',
                    background: active
                      ? 'linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.14))'
                      : 'transparent',
                    position: 'relative',
                    transition: 'color 160ms ease, background 160ms ease',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 3,
                      bgcolor: active ? 'secondary.main' : 'rgba(255,255,255,0.45)',
                      transform: active ? 'scaleX(1)' : 'scaleX(0)',
                      transformOrigin: 'center',
                      transition: 'transform 180ms ease',
                    },
                    '&:hover': {
                      color: '#fff',
                      background: active
                        ? 'linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.14))'
                        : 'rgba(255,255,255,0.05)',
                    },
                    '&:hover::after': { transform: 'scaleX(1)' },
                    '@media (prefers-reduced-motion: reduce)': {
                      transition: 'none',
                      '&::after': { transition: 'none' },
                    },
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
        <List sx={{ px: 0 }}>
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
                  // Same active language as the app-bar tabs, rotated for a
                  // vertical list: flat item, a 3px yellow indicator on the
                  // left edge, and a wash brightest beside it.
                  borderRadius: 0,
                  mb: 0.25,
                  px: 2.5, // aligns the labels with the wordmark above
                  color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                  position: 'relative',
                  background: active
                    ? 'linear-gradient(to right, rgba(255,255,255,0.14), rgba(255,255,255,0.06))'
                    : 'transparent',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor: active ? 'secondary.main' : 'transparent',
                  },
                  '&:hover': {
                    background: active
                      ? 'linear-gradient(to right, rgba(255,255,255,0.14), rgba(255,255,255,0.06))'
                      : 'rgba(255,255,255,0.05)',
                  },
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
                  sx={{
                    // The nav tabs' active language on a light ground: a soft
                    // ink wash brightest at the base, under a yellow bar.
                    fontSize: 'inherit',
                    color: 'text.primary',
                    fontWeight: 700,
                    px: 1,
                    py: 0.25,
                    position: 'relative',
                    background:
                      'linear-gradient(to bottom, rgba(31,43,54,0.03), rgba(31,43,54,0.08))',
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 2,
                      bgcolor: 'secondary.main',
                    },
                  }}
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
