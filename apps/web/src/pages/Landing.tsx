import {
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
import { Link as RouterLink, useNavigate } from 'react-router-dom';

const stats = [
  { value: '120+', label: 'Active volunteers' },
  { value: '18', label: 'Programs tracked' },
  { value: '96%', label: 'Shift attendance' },
];

/**
 * The prototype's landing: hero on the left, glassy auth card on the right.
 * Form submission wires to /auth in Phase 1; the layout and theme are the
 * Phase 0 deliverable.
 */
export function Landing() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const navigate = useNavigate();

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
              onChange={(_, v: 'login' | 'signup') => setTab(v)}
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

              <Box
                component="form"
                sx={{ display: 'grid', gap: 2 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  // Phase 1 wires this to POST /auth/login and /auth/signup.
                  navigate(tab === 'login' ? '/app/dashboard' : '/register');
                }}
              >
                <TextField label="Email ID" type="email" fullWidth />
                <TextField
                  label="Password"
                  type="password"
                  fullWidth
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                />
                <Button variant="pill" type="submit" size="large">
                  {tab === 'login' ? 'Login' : 'Create account →'}
                </Button>
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
