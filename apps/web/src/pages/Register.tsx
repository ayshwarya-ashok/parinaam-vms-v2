import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
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
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL, api, asApiError } from '@/api/client';
import { useAuth } from '@/app/auth';
import {
  firstProblem,
  phoneForApi,
  validateProfile,
  type ProfileErrors,
} from '@/app/validation';
import { tokens } from '@/theme';

interface OrganizationOption {
  id: string;
  name: string;
}

type ReferenceOptions = Record<string, Array<{ code: string; label: string }>>;

/** Credentials handed over by the landing page's sign-up tab, in memory only. */
interface RegistrationCredentials {
  email: string;
  password: string;
}

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Volunteer registration — the account and the profile, submitted together.
 *
 * The old flow created the account first and asked these questions afterwards,
 * so abandoning this form left a login that led nowhere. Now nothing exists
 * until "Submit registration" succeeds: the credentials arrive in router state
 * (never persisted), and POST /auth/register writes user and profile in one
 * transaction.
 *
 * The question set mirrors the public registration form: a volunteer answers
 * questions ("What would you like to help with?"), never column names, and
 * only what can be answered in a couple of minutes. Everything optional here
 * stays optional — staff fill in the rest on the profile after approval.
 */
export function Register() {
  const { status, user, register, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const credentials = (location.state as RegistrationCredentials | null) ?? null;

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
    occupation: '',
    skills: '',
    languages: [] as string[],
    areasOfInterest: [] as string[],
    availability: [] as string[],
    availabilityNotes: '',
    complianceRead: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);

  // Both lists are public: the form must render before an account exists, so
  // these use a bare client with no auth interceptor attached.
  const { data: organizations = [] } = useQuery({
    queryKey: ['public-organizations'],
    queryFn: async () =>
      (await axios.get<OrganizationOption[]>(`${API_BASE_URL}/organizations`)).data,
  });
  const { data: options = {} } = useQuery({
    queryKey: ['reference-values'],
    queryFn: async () => (await axios.get<ReferenceOptions>(`${API_BASE_URL}/reference-values`)).data,
    staleTime: 10 * 60_000,
  });

  // Already signed in with a profile? This page is finished with you.
  if (status === 'authenticated' && user?.profileComplete) {
    return <Navigate to="/app/dashboard" replace />;
  }
  // Arriving without credentials and without a session means a refresh or a
  // deep link. Nothing was created, so send them back to the start.
  if (status !== 'authenticated' && !credentials) {
    return <Navigate to="/login" replace />;
  }

  // Signed in but no profile: an account orphaned by the old two-step signup.
  // We hold no password for them, so finish via the authenticated endpoint.
  const finishingOrphan = status === 'authenticated' && !credentials;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblems((current) => (key in current ? { ...current, [key]: undefined } : current));
    setError(null);
  };

  const toggle = (key: 'languages' | 'areasOfInterest' | 'availability', code: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(code) ? f[key].filter((c) => c !== code) : [...f[key], code],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.complianceRead) {
      setError('Please confirm you have read the compliance report.');
      return;
    }
    if (form.category === 'CSR' && !form.organizationId) {
      setError('Please select the organization sponsoring your volunteering.');
      return;
    }
    const found = validateProfile(form);
    if (Object.keys(found).length > 0) {
      setProblems(found);
      setError(firstProblem(found));
      return;
    }
    setProblems({});

    setBusy(true);
    const profile = {
    firstName: form.firstName,
    lastName: form.lastName,
    gender: form.gender || undefined,
    dateOfBirth: form.dateOfBirth || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    phone: phoneForApi(form.phone),
    category: form.category,
    organizationId: form.category === 'CSR' ? form.organizationId : undefined,
    occupation: form.occupation || undefined,
    skills: form.skills || undefined,
    languages: form.languages.length ? form.languages : undefined,
    areasOfInterest: form.areasOfInterest.length ? form.areasOfInterest : undefined,
    availability: form.availability.length ? form.availability : undefined,
    availabilityNotes: form.availabilityNotes || undefined,
    complianceRead: form.complianceRead,
    };

    try {
      if (finishingOrphan) {
        await api.post('/volunteers', profile);
        await refresh();
      } else {
        await register({ ...profile, email: credentials!.email, password: credentials!.password });
      }
      navigate('/app/dashboard', { replace: true });
    } catch (err) {
      const apiError = asApiError(err);
      setError(
        apiError?.code === 'EMAIL_TAKEN'
          ? 'An account with this email already exists. Try logging in instead.'
          : (apiError?.message ?? 'Registration failed. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container maxWidth="xl" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
      <Grid container spacing={6} sx={{ py: 6, alignItems: 'center', width: '100%' }}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Box component="img" src="/parinaam-logo.svg" alt="Parinaam Volunteer Management" sx={{ height: 56, display: 'block', mb: 1 }} />
          <Typography variant="h1" sx={{ fontSize: 'clamp(2.6rem, 5vw, 4rem)', mt: 1 }}>
            Tell us about yourself.
          </Typography>
          <Typography sx={{ mt: 2.5, maxWidth: '32rem', color: 'text.secondary', lineHeight: 1.7 }}>
            A few questions so we can match you with the right opportunities. Only your name is
            required — everything else helps, but can wait.
          </Typography>
          <Typography sx={{ mt: 2, maxWidth: '32rem', color: 'text.secondary', fontSize: '0.9rem' }}>
            Your account is created when you submit this form, and our team reviews every
            registration before you are approved. We will email you either way.
          </Typography>
          {(credentials || user?.email) && (
            <Paper variant="outlined" sx={{ mt: 3, p: 1.5, borderRadius: 3, display: 'inline-block' }}>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
                Registering as <strong>{credentials?.email ?? user?.email}</strong>
              </Typography>
            </Paper>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 7 }}>
          <Paper
            elevation={8}
            sx={{
              p: 3,
              borderRadius: 6,
              bgcolor: 'rgba(255,255,255,0.82)',
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
              sx={{ display: 'grid', gap: 2.5, maxHeight: '64vh', overflowY: 'auto', pr: 1 }}
            >
              {/* ── About you ─────────────────────────────────────────────── */}
              <SectionTitle>About you</SectionTitle>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  label="First name"
                  required
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  error={Boolean(problems.firstName)}
                  helperText={problems.firstName}
                />
                <TextField
                  label="Last name"
                  required
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  error={Boolean(problems.lastName)}
                  helperText={problems.lastName}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  label="Date of birth"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: TODAY }}
                  autoComplete="bday"
                  value={form.dateOfBirth}
                  onChange={(e) => set('dateOfBirth', e.target.value)}
                  required
                  error={Boolean(problems.dateOfBirth)}
                  helperText={problems.dateOfBirth}
                />
                <TextField
                  select
                  label="Gender"
                  value={form.gender}
                  onChange={(e) => set('gender', e.target.value)}
                  required
                  error={Boolean(problems.gender)}
                  helperText={problems.gender}
                >
                  {['Female', 'Male', 'Non-binary', 'Prefer not to say'].map((g) => (
                    <MenuItem key={g} value={g}>
                      {g}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <TextField
                  label="Which city are you in?"
                  autoComplete="address-level2"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  required
                  error={Boolean(problems.city)}
                  helperText={problems.city}
                />
                <TextField
                  label="State"
                  autoComplete="address-level1"
                  value={form.state}
                  onChange={(e) => set('state', e.target.value)}
                  required
                  error={Boolean(problems.state)}
                  helperText={problems.state}
                />
              </Box>

              <TextField
                label="Phone number"
                type="tel"
                autoComplete="tel"
                placeholder="+91 00000 00000"
                required
                helperText={problems.phone ?? 'A 10-digit mobile number, so a coordinator can reach you on the day'}
                error={Boolean(problems.phone)}
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
              />

              {/* ── How you would like to help ────────────────────────────── */}
              <SectionTitle>How you would like to help</SectionTitle>

              <ChipPicker
                label="What would you like to help with?"
                options={options.AREA_OF_INTEREST ?? []}
                selected={form.areasOfInterest}
                onToggle={(code) => toggle('areasOfInterest', code)}
              />

              <ChipPicker
                label="Which languages do you speak?"
                options={options.LANGUAGE ?? []}
                selected={form.languages}
                onToggle={(code) => toggle('languages', code)}
              />

              {/*
                The codes and the prose, both optional. The chips are what staff
                can filter a roster on — "who can come on a Saturday?" — and the
                box below carries what a fixed list cannot: term-time only,
                needs a week's notice, alternate weekends.
              */}
              <ChipPicker
                label="When are you usually free?"
                hint="Tick any that suit. We will not hold you to it."
                options={options.AVAILABILITY ?? []}
                selected={form.availability}
                onToggle={(code) => toggle('availability', code)}
              />

              <TextField
                label="Anything we should know about your availability?"
                multiline
                minRows={2}
                placeholder="For example: term-time only, alternate weekends, or after 6pm."
                value={form.availabilityNotes}
                onChange={(e) => set('availabilityNotes', e.target.value)}
              />

              <TextField
                label="Skills and experience"
                multiline
                minRows={2}
                placeholder="e.g. First aid, teaching, IT support — anything you would rather we knew in advance."
                value={form.skills}
                onChange={(e) => set('skills', e.target.value)}
              />

              <TextField
                label="Occupation"
                autoComplete="organization-title"
                value={form.occupation}
                onChange={(e) => set('occupation', e.target.value)}
              />

              {/* ── Volunteering as ───────────────────────────────────────── */}
              <SectionTitle>Volunteering as</SectionTitle>

              <Box>
                <RadioGroup
                  row
                  value={form.category}
                  onChange={(e) => set('category', e.target.value as 'Individual' | 'CSR')}
                >
                  <FormControlLabel value="Individual" control={<Radio />} label="An individual" />
                  <FormControlLabel
                    value="CSR"
                    control={<Radio />}
                    label="Through my employer (CSR)"
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

              <Paper
                variant="outlined"
                sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.4)' }}
              >
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

              <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                <Button variant="pill" type="submit" size="large" disabled={busy} sx={{ flex: 1 }}>
                  {busy ? 'Creating your account…' : 'Submit registration'}
                </Button>
                {/*
                  A way out. Nothing has been created yet, so leaving costs
                  the visitor nothing — and a form with no exit is a trap.
                */}
                <Button
                  variant="pillOutlined"
                  size="large"
                  disabled={busy}
                  onClick={async () => {
                    if (finishingOrphan) await logout();
                    navigate('/', { replace: true });
                  }}
                >
                  Cancel
                </Button>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontWeight: 700,
        fontSize: '0.78rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: tokens.accentStrong,
        borderBottom: '1px solid rgba(31,43,54,0.10)',
        pb: 0.5,
        mt: 0.5,
      }}
    >
      {children}
    </Typography>
  );
}

function ChipPicker({
  label,
  hint,
  options,
  selected,
  onToggle,
}: {
  label: string;
  hint?: string;
  options: Array<{ code: string; label: string }>;
  selected: string[];
  onToggle: (code: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <Box>
      <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>{label}</Typography>
      {hint && (
        <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary', mb: 0.75 }}>
          {hint}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: hint ? 0 : 0.75 }}>
        {options.map((option) => {
          const active = selected.includes(option.code);
          return (
            <Chip
              key={option.code}
              label={option.label}
              onClick={() => onToggle(option.code)}
              variant={active ? 'filled' : 'outlined'}
              sx={
                active
                  ? {
                      bgcolor: alpha(tokens.accent, 0.16),
                      border: `1px solid ${tokens.accent}`,
                      fontWeight: 700,
                    }
                  : undefined
              }
            />
          );
        })}
      </Box>
    </Box>
  );
}
