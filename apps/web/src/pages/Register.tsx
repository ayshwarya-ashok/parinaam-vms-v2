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
  emailError,
  firstProblem,
  phoneForApi,
  validateProfile,
  type ProfileErrors,
  AGE_GROUPS,
} from '@/app/validation';
import { tokens } from '@/theme';
import { PasswordField } from '@/components/PasswordField';
import { StateCityFields } from '@/components/StateCityFields';

type ReferenceOptions = Record<string, Array<{ code: string; label: string }>>;

/** Credentials handed over by the landing page's sign-up tab, in memory only. */
interface RegistrationCredentials {
  email: string;
  password: string;
}


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
    ageGroup: '',
    city: '',
    state: '',
    phone: '',
    category: 'Individual' as 'Individual' | 'CSR',
    subCategory: '' as '' | 'Student',
    institution: '',
    // CSR organization: a fixed partner list plus Other → free text (Round 44).
    organizationChoice: '',
    organizationOther: '',
    // Occupation: dropdown plus Other → free text; optional.
    occupationChoice: '',
    occupationOther: '',
    referralSource: '',
    skills: '',
    languages: [] as string[],
    areasOfInterest: [] as string[],
    // "How often would you like to volunteer?" — a single choice; "other"
    // opens a free-text field whose value is what gets stored.
    availability: '',
    availabilityOther: '',
    availabilityNotes: '',
    complianceRead: false,
  });
  // The shared-link flow: no session, no hand-over from the landing page —
  // the page carries its own account fields and registers in one step.
  const [account, setAccount] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProfileErrors>({});
  const [busy, setBusy] = useState(false);
  // Submission succeeded: show the thank-you screen instead of the form.
  const [registered, setRegistered] = useState(false);
  const { data: options = {} } = useQuery({
    queryKey: ['reference-values'],
    queryFn: async () => (await axios.get<ReferenceOptions>(`${API_BASE_URL}/reference-values`)).data,
    staleTime: 10 * 60_000,
  });

  // Already signed in with a profile? This page is finished with you — unless
  // the profile was completed HERE just now, in which case the thank-you
  // screen below owns the moment.
  if (!registered && status === 'authenticated' && user?.profileComplete) {
    return <Navigate to="/app/dashboard" replace />;
  }
  // The post-submission thank-you (Round 44). "Register someone else" signs
  // this fresh session out and reloads a clean form — the common case is one
  // household registering several people from the same device.
  if (registered) {
    return (
      <Container maxWidth="sm" sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center' }}>
        <Paper variant="outlined" sx={{ p: { xs: 3, md: 5 }, borderRadius: 4, width: '100%', textAlign: 'left' }}>
          <Box component="img" src="/parinaam-logo.svg" alt="Parinaam" sx={{ height: 48, display: 'block', mb: 2 }} />
          <Typography variant="h3" sx={{ mb: 2 }}>
            Thank you! 💙
          </Typography>
          <Typography sx={{ fontSize: '1.05rem', lineHeight: 1.7, color: 'text.secondary', mb: 3 }}>
            Thank you for registering. Our team will review your details and get in touch with
            you. We thank you for being a Goodheart.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button variant="pill" onClick={() => navigate('/app/dashboard', { replace: true })}>
              Go to my dashboard
            </Button>
            <Button
              variant="pillOutlined"
              onClick={() => {
                void (async () => {
                  await logout();
                  window.location.assign('/register');
                })();
              }}
            >
              Register someone else
            </Button>
          </Box>
        </Paper>
      </Container>
    );
  }

  // Arriving without credentials and without a session is the SHARED LINK:
  // the Parinaam team hands /register to volunteers directly, so the page is
  // self-contained — it asks for email + password itself and registers in one
  // atomic step. (It used to redirect to /login here, which defeated the link.)
  const standalone = status !== 'authenticated' && !credentials;

  // Signed in but no profile: an account orphaned by the old two-step signup.
  // We hold no password for them, so finish via the authenticated endpoint.
  const finishingOrphan = status === 'authenticated' && !credentials;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblems((current) => (key in current ? { ...current, [key]: undefined } : current));
    setError(null);
  };

  const toggle = (key: 'languages' | 'areasOfInterest', code: string) =>
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(code) ? f[key].filter((c) => c !== code) : [...f[key], code],
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (standalone) {
      const badEmail = emailError(account.email, true);
      if (badEmail) {
        setError(badEmail);
        return;
      }
      if (account.password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (account.password !== account.confirm) {
        setError('The passwords do not match.');
        return;
      }
    }
    if (!form.complianceRead) {
      setError('Please confirm you have read the compliance report.');
      return;
    }
    if (form.category === 'CSR' && !form.organizationChoice) {
      setError('Please select the organization sponsoring your volunteering.');
      return;
    }
    if (form.category === 'CSR' && form.organizationChoice === 'Other' && !form.organizationOther.trim()) {
      setError('Please type the name of your organization.');
      return;
    }
    if (form.subCategory === 'Student' && !form.institution) {
      setError('Please select your institution.');
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
    ageGroup: form.ageGroup || undefined,
    city: form.city || undefined,
    state: form.state || undefined,
    phone: phoneForApi(form.phone),
    category: form.category,
    subCategory: form.subCategory || undefined,
    institution: form.subCategory === 'Student' ? form.institution : undefined,
    organizationName:
      form.category === 'CSR'
        ? form.organizationChoice === 'Other'
          ? form.organizationOther.trim()
          : form.organizationChoice
        : undefined,
    occupation: form.occupationChoice
      ? form.occupationChoice === 'Other'
        ? form.occupationOther.trim() || undefined
        : form.occupationChoice
      : undefined,
    referralSource: form.referralSource || undefined,
    skills: form.skills || undefined,
    languages: form.languages.length ? form.languages : undefined,
    areasOfInterest: form.areasOfInterest.length ? form.areasOfInterest : undefined,
    availability: form.availability
      ? [
          form.availability === 'other' && form.availabilityOther.trim()
            ? form.availabilityOther.trim()
            : form.availability,
        ]
      : undefined,
    availabilityNotes: form.availabilityNotes || undefined,
    complianceRead: form.complianceRead,
    };

    try {
      if (finishingOrphan) {
        await api.post('/volunteers', profile);
        await refresh();
      } else if (credentials) {
        await register({ ...profile, email: credentials.email, password: credentials.password });
      } else {
        await register({
          ...profile,
          email: account.email.trim().toLowerCase(),
          password: account.password,
        });
      }
      setRegistered(true);
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
              {standalone && (
                <>
                  <SectionTitle>Your account</SectionTitle>
                  <Grid container spacing={2} sx={{ mb: 2.5 }}>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        required
                        type="email"
                        label="Email"
                        value={account.email}
                        onChange={(e) => {
                          setError(null);
                          setAccount((a) => ({ ...a, email: e.target.value }));
                        }}
                        helperText="We send your approval (and everything after) here"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <PasswordField
                        fullWidth
                        required
                        label="Password"
                        value={account.password}
                        onChange={(e) => setAccount((a) => ({ ...a, password: e.target.value }))}
                        helperText="At least 8 characters"
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <PasswordField
                        fullWidth
                        required
                        label="Confirm password"
                        value={account.confirm}
                        error={account.confirm !== '' && account.confirm !== account.password}
                        helperText={
                          account.confirm !== '' && account.confirm !== account.password
                            ? 'Does not match'
                            : ' '
                        }
                        onChange={(e) => setAccount((a) => ({ ...a, confirm: e.target.value }))}
                      />
                    </Grid>
                  </Grid>
                </>
              )}

              {/* ── Volunteering as — the 2nd question, right after the account
                     (Round 44): the answer shapes what the rest of the form asks. ── */}
              <SectionTitle>Volunteering as</SectionTitle>

              <Box>
                {/* Student is Individual + a tracked sub-category, so the radio
                    speaks in three options while the API still sees two
                    categories. */}
                <RadioGroup
                  row
                  value={form.subCategory === 'Student' ? 'Student' : form.category}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      category: v === 'CSR' ? 'CSR' : 'Individual',
                      subCategory: v === 'Student' ? 'Student' : '',
                      // Only CSR names an organization; a student names an
                      // institution instead, and Individuals are not asked.
                      organizationChoice: v === 'CSR' ? f.organizationChoice : '',
                      organizationOther: v === 'CSR' ? f.organizationOther : '',
                      institution: v === 'Student' ? f.institution : '',
                    }));
                  }}
                >
                  <FormControlLabel value="Individual" control={<Radio />} label="As an individual" />
                  <FormControlLabel
                    value="CSR"
                    control={<Radio />}
                    label="Through my organization (CSR)"
                  />
                  <FormControlLabel value="Student" control={<Radio />} label="As a student" />
                </RadioGroup>
              </Box>

              {form.subCategory === 'Student' ? (
                <TextField
                  select
                  required
                  label="Institution"
                  value={form.institution}
                  onChange={(e) => set('institution', e.target.value)}
                  helperText="Pick the institution you study at"
                >
                  {(options.INSTITUTION ?? []).map((inst) => (
                    <MenuItem key={inst.code} value={inst.label}>
                      {inst.label}
                    </MenuItem>
                  ))}
                </TextField>
              ) : form.category === 'CSR' ? (
                <>
                  {/* The client's CSR partner list; "Other" captures any name. */}
                  <TextField
                    select
                    required
                    label="Sponsoring organization"
                    value={form.organizationChoice}
                    onChange={(e) => set('organizationChoice', e.target.value)}
                    helperText="CSR volunteers must name their organization"
                  >
                    {['Odessa', 'PwC', 'Deutsche Bank', 'IG Group', 'Finastra', 'Other'].map((name) => (
                      <MenuItem key={name} value={name}>
                        {name}
                      </MenuItem>
                    ))}
                  </TextField>
                  {form.organizationChoice === 'Other' && (
                    <TextField
                      required
                      label="Name of your organization"
                      value={form.organizationOther}
                      onChange={(e) => set('organizationOther', e.target.value)}
                    />
                  )}
                </>
              ) : null}

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
                  select
                  label="Age group"
                  value={form.ageGroup}
                  onChange={(e) => set('ageGroup', e.target.value)}
                  required
                  error={Boolean(problems.ageGroup)}
                  helperText={problems.ageGroup}
                >
                  {AGE_GROUPS.map((g) => (
                    <MenuItem key={g} value={g}>
                      {g}
                    </MenuItem>
                  ))}
                </TextField>
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

              {/* State first, then its cities; "Others" opens a free-text field. */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <StateCityFields
                  state={form.state}
                  city={form.city}
                  onStateChange={(v) => set('state', v)}
                  onCityChange={(v) => set('city', v)}
                  stateError={problems.state}
                  cityError={problems.city}
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

              {/* ── How would you like to help? ───────────────────────────── */}
              <SectionTitle>How would you like to help?</SectionTitle>

              {/* Checkboxes, per the client's form spec (Round 37). */}
              <Box>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 0.5 }}>
                  What would you like to help with?
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  {(options.AREA_OF_INTEREST ?? []).map((o) => (
                    <FormControlLabel
                      key={o.code}
                      control={
                        <Checkbox
                          size="small"
                          checked={form.areasOfInterest.includes(o.code)}
                          onChange={() => toggle('areasOfInterest', o.code)}
                        />
                      }
                      label={<Typography sx={{ fontSize: '0.9rem' }}>{o.label}</Typography>}
                    />
                  ))}
                </Box>
              </Box>

              <ChipPicker
                label="Which languages do you speak?"
                options={options.LANGUAGE ?? []}
                selected={form.languages}
                onToggle={(code) => toggle('languages', code)}
              />

              {/* Frequency is one answer, not many — radios per the form spec. */}
              <Box>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, mb: 0.5 }}>
                  How often would you like to volunteer with Parinaam?
                </Typography>
                <RadioGroup
                  row
                  value={form.availability}
                  onChange={(e) => set('availability', e.target.value)}
                >
                  {(options.AVAILABILITY ?? []).map((o) => (
                    <FormControlLabel
                      key={o.code}
                      value={o.code}
                      control={<Radio size="small" />}
                      label={<Typography sx={{ fontSize: '0.9rem' }}>{o.label}</Typography>}
                    />
                  ))}
                </RadioGroup>
                {form.availability === 'other' && (
                  <TextField
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                    label="Tell us the rhythm that works for you"
                    placeholder="For example: twice a year, around exams, festival seasons."
                    value={form.availabilityOther}
                    onChange={(e) => set('availabilityOther', e.target.value)}
                  />
                )}
              </Box>

              <TextField
                label="Anything else you would like us to know?"
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

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  select
                  label="Occupation (optional)"
                  value={form.occupationChoice}
                  onChange={(e) => set('occupationChoice', e.target.value)}
                >
                  <MenuItem value="">
                    <em>Prefer not to say</em>
                  </MenuItem>
                  {(options.OCCUPATION ?? []).map((o) => (
                    <MenuItem key={o.code} value={o.label}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="How did you hear about Parinaam? (optional)"
                  value={form.referralSource}
                  onChange={(e) => set('referralSource', e.target.value)}
                >
                  <MenuItem value="">
                    <em>Prefer not to say</em>
                  </MenuItem>
                  {(options.REFERRAL_SOURCE ?? []).map((o) => (
                    <MenuItem key={o.code} value={o.label}>
                      {o.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Box>
              {form.occupationChoice === 'Other' && (
                <TextField
                  label="Please specify your occupation"
                  value={form.occupationOther}
                  onChange={(e) => set('occupationOther', e.target.value)}
                />
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
                  {busy ? 'Creating your account…' : 'Submit'}
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
