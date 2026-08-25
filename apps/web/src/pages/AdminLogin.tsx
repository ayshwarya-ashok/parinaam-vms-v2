import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { authErrorMessage, useAuth } from '@/app/auth';

/**
 * Administrator sign-in. Same credentials endpoint as the landing page; the
 * difference is the role check — a volunteer account is rejected here rather
 * than dropped into an admin shell the guard would bounce anyway.
 */
export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { status, user, login, logout } = useAuth();
  const navigate = useNavigate();

  if (status === 'authenticated' && user?.role === 'admin') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const sessionUser = await login(email, password);
      if (sessionUser.role !== 'admin') {
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
    <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Paper
        elevation={8}
        sx={{
          p: 4,
          borderRadius: 4,
          width: '100%',
          bgcolor: 'rgba(255,255,255,0.82)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <Box component="img" src="/parinaam-logo.svg" alt="Parinaam" sx={{ height: 52, display: 'block', mb: 0.5, mx: 'auto' }} />
        <Typography variant="overline">Admin</Typography>
        <Typography variant="h3" sx={{ fontSize: '2rem', mb: 1 }}>
          Administrator Sign In
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3 }}>
          Access administrative features and manage volunteers, programs and settings.
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
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <TextField
            label="Password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="pillOutlined" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button variant="pill" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
