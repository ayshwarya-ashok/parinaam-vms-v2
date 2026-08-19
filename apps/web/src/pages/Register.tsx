import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  Grid2 as Grid,
  Link,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { useAuth } from '@/app/auth';

interface OrganizationOption {
  id: string;
  name: string;
}

/**
 * The profile-completion step after signup. BR-01: a CSR volunteer must name
 * their sponsoring organization; the picker only appears for that category.
 */
export function Register() {
  const { status, user, refresh } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    gender: '',
    dateOfBirth: '',
    city: '',
    state: '',
    phone: '',
    category: 'Individual' as 'Individual' | 'CSR',
    organizationId: '',
    skills: '',
    complianceRead: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: organizations = [] } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => (await api.get<OrganizationOption[]>('/organizations')).data,
    enabled: status === 'authenticated' && form.category === 'CSR',
  });

  if (status === 'anonymous') return <Navigate to="/" replace />;
  if (status === 'authenticated' && user?.profileComplete) {
    return <Navigate to="/app/dashboard" replace />;
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.complianceRead) {
      setError('Please confirm you have read the compliance report.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/volunteers', {
        firstName: form.firstName,
        lastName: form.lastName,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        phone: form.phone || undefined,
        category: form.category,
        organizationId: form.category === 'CSR' ? form.organizationId || undefined : undefined,
        skills: form.skills || undefined,
        complianceRead: form.complianceRead,
      });
      await refresh();
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Grid container spacing={6} sx={{ py: 6, alignItems: 'center', width: '100%' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="overline">Parinaam Volunteer Management</Typography>
          <Typography variant="h1" sx={{ fontSize: 'clamp(3rem, 5vw, 4.5rem)', mt: 1 }}>
            One last step.
          </Typography>
          <Typography sx={{ mt: 2.5, maxWidth: '32rem', color: 'text.secondary', lineHeight: 1.7 }}>
            Tell us a bit more about yourself so we can match you with the right opportunities.
          </Typography>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper
            elevation={8}
            sx={{
              p: 3,
              borderRadius: 6,
              bgcolor: 'rgba(255,252,247,0.82)',
              backdropFilter: 'blur(18px)',
            }}
          >
            <Typography variant="overline">Complete your profile</Typography>
            <Typography variant="h3" sx={{ fontSize: '1.8rem', mb: 2.5 }}>
              Volunteer registration
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
                {error}
              </Alert>
            )}

            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{ display: 'grid', gap: 2, maxHeight: '62vh', overflowY: 'auto', pr: 0.5 }}
            >
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  label="First name"
                  required
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                />
                <TextField
                  label="Last name"
                  required
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                />
              </Box>

              <TextField
                select
                label="Gender"
                value={form.gender}
                onChange={(e) => set('gender', e.target.value)}
              >
                <MenuItem value="">Prefer not to say now</MenuItem>
                {['Female', 'Male', 'Non-binary', 'Prefer not to say'].map((g) => (
                  <MenuItem key={g} value={g}>
                    {g}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Date of birth"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.dateOfBirth}
                onChange={(e) => set('dateOfBirth', e.target.value)}
              />

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
                <TextField label="State" value={form.state} onChange={(e) => set('state', e.target.value)} />
              </Box>

              <TextField
                label="Phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 00000 00000"
              />

              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.92rem', mb: 0.5 }}>
                  I am volunteering as
                </Typography>
                <RadioGroup
                  row
                  value={form.category}
                  onChange={(e) => set('category', e.target.value as 'Individual' | 'CSR')}
                >
                  <FormControlLabel value="Individual" control={<Radio />} label="Individual" />
                  <FormControlLabel
                    value="CSR"
                    control={<Radio />}
                    label="Corporate (CSR) volunteer"
                  />
                </RadioGroup>
              </Box>

              {form.category === 'CSR' && (
                <TextField
                  select
                  required
                  label="Sponsoring organization"
                  value={form.organizationId}
                  onChange={(e) => set('organizationId', e.target.value)}
                  helperText="CSR volunteers must name their organization"
                >
                  {organizations.map((org) => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}

              <TextField
                label="Skills"
                value={form.skills}
                onChange={(e) => set('skills', e.target.value)}
                placeholder="e.g. First aid, Teaching, IT"
              />

              <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.4)' }}>
                <Link href="#" onClick={(e) => e.preventDefault()} sx={{ fontSize: '0.9rem' }}>
                  Read the compliance report
                </Link>
                <FormControlLabel
                  sx={{ display: 'flex', mt: 0.5 }}
                  control={
                    <Checkbox
                      checked={form.complianceRead}
                      onChange={(e) => set('complianceRead', e.target.checked)}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: '0.9rem' }}>
                      I have read the compliance report
                    </Typography>
                  }
                />
              </Paper>

              <Button variant="pill" type="submit" size="large" disabled={busy}>
                {busy ? 'Saving…' : 'Register me'}
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}
