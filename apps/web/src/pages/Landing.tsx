import {
  Alert,
  Box,
  Button,
  Container,
  Grid2 as Grid,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { authErrorMessage, isMissingAccount, useAuth, type SessionUser } from '@/app/auth';

const stats = [
  { value: '120+', label: 'Active volunteers' },
  { value: '18', label: 'Programs tracked' },
  { value: '96%', label: 'Shift attendance' },
];

function landingFor(user: SessionUser): string {
  if (user.role === 'admin') return '/admin/dashboard';
  // A volunteer without a profile finishes registration first.
  return user.profileComplete ? '/app/dashboard' : '/register';
}

/** The prototype's landing: hero on the left, glassy auth card on the right. */
export function Landing() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offerSignup, setOfferSignup] = useState(false);
  const [busy, setBusy] = useState(false);

  const { status, user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Already signed in? The landing page is not for you.
  if (status === 'authenticated' && user) {
    return <Navigate to={landingFor(user)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOfferSignup(false);
    setBusy(true);
    try {
      if (tab === 'signup') {
        // No account is created here. Registration is atomic — credentials
        // travel (in memory only) to the profile form and are written with it.
        const { data } = await api.post<{ available: boolean }>('/auth/check-email', { email });
        if (!data.available) {
          setError('An account with this email already exists. Try logging in.');
          return;
        }
        navigate('/register', { state: { email, password } });
        return;
      }

      const sessionUser = await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && sessionUser.role === 'volunteer' ? from : landingFor(sessionUser), {
        replace: true,
      });
    } catch (err) {
      setError(authErrorMessage(err));
      setOfferSignup(isMissingAccount(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Grid container spacing={6} sx={{ py: 6, alignItems: 'center', width: '100%' }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="overline">Parinaam Volunteer Management</Typography>
          <Typography
            variant="h1"
            sx={{ fontSize: 'clamp(3rem, 6vw, 5.5rem)', maxWidth: '12ch', mt: 1 }}
          >
            Connect. Contribute. Create Impact.
          </Typography>
          <Typography sx={{ mt: 2.5, maxWidth: '34rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Empowering communities by seamlessly connecting passionate volunteers with meaningful
            opportunities.
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
              bgcolor: 'rgba(255,252,247,0.82)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v: 'login' | 'signup') => {
                setTab(v);
                setError(null);
                setOfferSignup(false);
              }}
              variant="fullWidth"
              sx={{
                bgcolor: 'rgba(19,35,37,0.06)',
                borderRadius: 999,
                minHeight: 0,
                p: 0.5,
                '& .MuiTabs-indicator': { display: 'none' },
                '& .MuiTab-root': { borderRadius: 999, minHeight: 44, fontWeight: 600 },
                '& .Mui-selected': { bgcolor: 'primary.main', color: '#fff !important' },
              }}
            >
              <Tab label="Login" value="login" />
              <Tab label="Sign Up" value="signup" />
            </Tabs>

            <Box sx={{ mt: 3 }}>
              <Typography variant="overline">
                {tab === 'login' ? 'Welcome back' : 'New here?'}
              </Typography>
              <Typography variant="h3" sx={{ fontSize: '1.8rem', mb: 2.5 }}>
                {tab === 'login' ? 'Access your volunteer dashboard' : 'Create your account'}
              </Typography>

              {error && (
                <Alert
                  severity={offerSignup ? 'info' : 'error'}
                  sx={{ mb: 2, borderRadius: 3 }}
                  action={
                    offerSignup ? (
                      <Button
                        size="small"
                        onClick={() => {
                          setTab('signup');
                          setError(null);
                          setOfferSignup(false);
                        }}
                      >
                        Sign up
                      </Button>
                    ) : undefined
                  }
                >
                  {error}
                </Alert>
              )}

              <Box component="form" sx={{ display: 'grid', gap: 2 }} onSubmit={handleSubmit}>
                <TextField
                  label="Email ID"
                  type="email"
                  required
                  fullWidth
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <TextField
                  label="Password"
                  type="password"
                  required
                  fullWidth
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  helperText={tab === 'signup' ? 'At least 8 characters' : undefined}
                />
                <Button variant="pill" type="submit" size="large" disabled={busy}>
                  {busy ? 'Please wait…' : tab === 'login' ? 'Login' : 'Continue →'}
                </Button>
                {tab === 'signup' && (
                  <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', textAlign: 'center' }}>
                    Next: a few questions about you. Your account is created when you finish.
                  </Typography>
                )}
              </Box>

              <Box sx={{ mt: 2.5, textAlign: 'center' }}>
                <Typography
                  component={RouterLink}
                  to="/admin/login"
                  sx={{ color: 'secondary.dark', fontSize: '0.95rem', textDecoration: 'none' }}
                >
                  Admin? Sign in here →
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
