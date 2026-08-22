import {
  Alert,
  Box,
  Button,
  Grid2 as Grid,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, asApiError } from '@/api/client';
import { isUnchanged, useToast } from '@/app/toast';
import {
  firstProblem,
  phoneForApi,
  validateProfile,
  type ProfileErrors,
} from '@/app/validation';
import { PageShell, StatusPill } from '@/components';

interface Profile {
  id: string;
  firstName: string;
  lastName: string;
  gender: string | null;
  dateOfBirth: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  category: 'Individual' | 'CSR';
  organization: { name: string } | null;
  phase: 'Onboarding' | 'In Training' | 'Active' | 'Inactive';
  skills: string | null;
  emailOptIn: boolean;
  createdAt: string;
}

export function ProfilePage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<Partial<Profile>>({});
  const [original, setOriginal] = useState<Partial<Profile> | null>(null);
  const [problems, setProblems] = useState<ProfileErrors>({});
  const [error, setError] = useState<string | null>(null);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<Profile>('/volunteers/me')).data,
  });

  useEffect(() => {
    if (profile) {
      setForm(profile);
      setOriginal(profile);
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch('/volunteers/me', {
          firstName: form.firstName,
          lastName: form.lastName,
          gender: form.gender || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          city: form.city ?? undefined,
          state: form.state ?? undefined,
          phone: phoneForApi(form.phone),
          skills: form.skills ?? undefined,
          emailOptIn: form.emailOptIn,
        })
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated');
      setError(null);
    },
    onError: (err) => {
      setError(asApiError(err)?.message ?? 'Could not save your profile.');
      toast.failure(err, 'Could not save your profile.');
    },
  });

  /**
   * Guard the save rather than the mutation: comparing against the record we
   * loaded is the only way to know nothing moved, and reporting "Profile
   * updated" for an untouched form is how that message stops meaning anything.
   */
  const handleSave = () => {
    const found = validateProfile(form);
    if (Object.keys(found).length > 0) {
      setProblems(found);
      toast.failure(firstProblem(found));
      return;
    }
    setProblems({});

    // Compare only the fields this form can actually change.
    const fields = ['firstName', 'lastName', 'gender', 'dateOfBirth', 'city', 'state', 'phone', 'skills', 'emailOptIn'] as const;
    const pick = (source: Partial<Profile>) =>
      Object.fromEntries(fields.map((f) => [f, source[f] ?? ''])) as Record<string, unknown>;

    if (original && isUnchanged(pick(form), pick(original))) {
      toast.noChanges();
      return;
    }
    save.mutate();
  };

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setProblems((current) => (key in current ? { ...current, [key]: undefined } : current));
  };

  if (isLoading || !profile) {
    return (
      <PageShell title="My Profile" maxWidth="md">
        <Typography color="text.secondary">Loading…</Typography>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="My Profile"
      maxWidth="md"
      actions={<StatusPill status={profile.phase === 'In Training' ? 'pending' : profile.phase === 'Active' ? 'active' : 'draft'} />}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          {error}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.72)' }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="First name"
              fullWidth
              value={form.firstName ?? ''}
              onChange={(e) => set('firstName', e.target.value)}
              required
              error={Boolean(problems.firstName)}
              helperText={problems.firstName}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Last name"
              fullWidth
              value={form.lastName ?? ''}
              onChange={(e) => set('lastName', e.target.value)}
              required
              error={Boolean(problems.lastName)}
              helperText={problems.lastName}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Gender"
              fullWidth
              value={form.gender ?? ''}
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
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Date of birth"
              type="date"
              fullWidth
              InputLabelProps={{ shrink: true }}
              value={form.dateOfBirth ?? ''}
              onChange={(e) => set('dateOfBirth', e.target.value)}
              required
              error={Boolean(problems.dateOfBirth)}
              helperText={problems.dateOfBirth}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="City"
              fullWidth
              value={form.city ?? ''}
              onChange={(e) => set('city', e.target.value)}
              required
              error={Boolean(problems.city)}
              helperText={problems.city}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="State"
              fullWidth
              value={form.state ?? ''}
              onChange={(e) => set('state', e.target.value)}
              required
              error={Boolean(problems.state)}
              helperText={problems.state}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Phone"
              fullWidth
              required
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
              error={Boolean(problems.phone)}
              helperText={problems.phone ?? '10-digit mobile number'}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Skills"
              fullWidth
              value={form.skills ?? ''}
              onChange={(e) => set('skills', e.target.value)}
              placeholder="e.g. First aid, Teaching"
            />
          </Grid>
          <Grid size={12}>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 3,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                bgcolor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 600, fontSize: '0.92rem' }}>
                  Announcement emails
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem' }}>
                  New-opportunity broadcasts. Confirmations and attendance mail always arrive.
                </Typography>
              </Box>
              <Switch
                checked={form.emailOptIn ?? true}
                onChange={(e) => set('emailOptIn', e.target.checked)}
              />
            </Paper>
          </Grid>
        </Grid>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mt: 3,
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
            {profile.category === 'CSR'
              ? `CSR volunteer · ${profile.organization?.name ?? 'organization'}`
              : 'Individual volunteer'}
            {' · '}joined {new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </Typography>
          <Button variant="pill" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </Paper>
    </PageShell>
  );
}
