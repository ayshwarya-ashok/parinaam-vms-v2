import {
  Alert,
  Box,
  Button,
  Container,
  Grid2 as Grid,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE_URL } from '@/api/client';
import { authErrorMessage, useAuth } from '@/app/auth';
import { PasswordField } from '@/components/PasswordField';

interface PublicStats {
  stats: { volunteers: number; active_programs: number; attendance_pct: string; hours: string };
}

/**
 * Back-office sign-in (administrators and field coordinators). Same
 * credentials endpoint as the landing page; the difference is the role check —
 * a volunteer account is rejected here rather than dropped into an admin
 * shell the guard would bounce anyway.
 *
 * Visually a sibling of the volunteer landing: hero on the left, glassy auth
 * card on the right, live figures instead of invented ones.
 */
export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, user, login, logout } = useAuth();
  const navigate = useNavigate();

  // The same public aggregates the impact page renders — visible before any
  // session exists, and honest about what the back office is running.
  const { data: publicStats } = useQuery({
    queryKey: ['public-impact'],
    queryFn: async () => (await axios.get<PublicStats>(`${API_BASE_URL}/public/impact`)).data,
    staleTime: 5 * 60_000,
  });

  const stats = [
    { value: publicStats ? String(publicStats.stats.active_programs) : '—', label: 'Programs running' },
    { value: publicStats ? String(publicStats.stats.volunteers) : '—', label: 'Volunteers to guide' },
    { value: publicStats ? `${Number(publicStats.stats.hours)}` : '—', label: 'Hours recorded' },
  ];

  if (status === 'authenticated' && (user?.role === 'admin' || user?.role === 'field_coordinator')) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sessionUser = await login(email, password);
      if (sessionUser.role !== 'admin' && sessionUser.role !== 'field_coordinator') {
        // Correct password, wrong door. End the session we just created.
        await logout();
        setError('This account is not an administrator. Use the volunteer login instead.');
        return;
      }
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Grid container spacing={6} sx={{ py: 6, alignItems: 'center', width: '100%' }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Box
            component="img"
            src="/parinaam-logo.svg"
            alt="Parinaam Volunteer Management"
            sx={{ height: 60, display: 'block', mb: 1 }}
          />
          <Typography variant="overline" sx={{ letterSpacing: '0.14em' }}>
            Back office
          </Typography>
          <Typography
            variant="h1"
            sx={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)', maxWidth: '13ch', mt: 1 }}
          >
            Behind every session, a plan.
          </Typography>
          <Typography sx={{ mt: 2.5, maxWidth: '34rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Programs, sessions, volunteers, attendance and recognition — run from one place, by
            the people who make the field work.
          </Typography>

          <Grid container spacing={2} sx={{ mt: 4, maxWidth: '40rem' }}>
            {stats.map((stat) => (
              <Grid key={stat.label} size={4}>
                <Paper
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.4)' }}
                >
                  <Typography sx={{ fontSize: '1.8rem', fontWeight: 700 }}>{stat.value}</Typography>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
                    {stat.label}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper
            elevation={8}
            sx={{
              p: 3,
              borderRadius: 6,
              bgcolor: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <Typography variant="h3" sx={{ fontSize: '1.6rem' }}>
              Staff sign in
            </Typography>
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem', mt: 0.5, mb: 2.5 }}>
              For administrators and field coordinators. Volunteers sign in from the{' '}
              <Box
                component="span"
                onClick={() => navigate('/login')}
                sx={{ color: 'primary.main', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
              >
                volunteer login
              </Box>
              .
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
                {error}
              </Alert>
            )}

            <Box component="form" sx={{ display: 'grid', gap: 2 }} onSubmit={handleSubmit}>
              <TextField
                label="Email"
                type="email"
                required
                fullWidth
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <PasswordField
                label="Password"
                required
                fullWidth
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <Button variant="pill" type="submit" size="large" disabled={busy} sx={{ mt: 0.5 }}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button variant="pillOutlined" onClick={() => navigate('/')}>
                Back to the impact page
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
