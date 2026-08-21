import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useActivity, useCoordinators } from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { PageShell } from '@/components';

/**
 * Scheduling is where dates enter the system. Single session or a series —
 * the series helper is the payoff of the Program → Activity → Event remodel.
 */
export function ScheduleEventForm() {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: activity } = useActivity(activityId);
  const { data: coordinators = [] } = useCoordinators();

  const [mode, setMode] = useState<'single' | 'series'>('single');
  const [form, setForm] = useState({
    name: '',
    date: '',
    startDate: '',
    endDate: '',
    pattern: 'weekly' as 'weekly' | 'monthly',
    startTime: '09:00',
    durationHours: '',
    location: '',
    city: '',
    maxSlots: '',
    coordinatorId: '',
    publishNow: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-fill from activity defaults — the session's values win once edited.
  useEffect(() => {
    if (activity) {
      setForm((f) => ({
        ...f,
        durationHours: f.durationHours || (activity.defaultDurationHours ?? ''),
        location: f.location || (activity.defaultLocation ?? ''),
        maxSlots: f.maxSlots || String(activity.defaultMaxSlots ?? 10),
      }));
    }
  }, [activity]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const common = {
      startTime: form.startTime,
      durationHours: form.durationHours ? Number(form.durationHours) : undefined,
      location: form.location || undefined,
      city: form.city || undefined,
      maxSlots: form.maxSlots ? Number(form.maxSlots) : undefined,
      coordinatorId: form.coordinatorId || undefined,
    };
    try {
      if (mode === 'single') {
        const { data } = await api.post<{ id: string }>(`/activities/${activityId}/events`, {
          ...common,
          name: form.name || undefined,
          date: form.date,
          status: form.publishNow ? 'upcoming' : 'draft',
        });
        enqueueSnackbar(
          form.publishNow ? 'Session scheduled and open for enrollment' : 'Session saved as a draft',
          { variant: 'success' },
        );
        void data;
      } else {
        const { data } = await api.post<{ count: number }>(
          `/activities/${activityId}/events/series`,
          { ...common, startDate: form.startDate, endDate: form.endDate, pattern: form.pattern },
        );
        enqueueSnackbar(
          `${data.count} sessions created as drafts — publish each when ready`,
          { variant: 'success' },
        );
      }
      void queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
      void queryClient.invalidateQueries({ queryKey: ['programs'] });
      navigate(`/admin/activities/${activityId}`);
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not schedule.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title="Schedule Session"
      description="Fields left at their defaults inherit from the activity. The coordinator falls back to the program's default when unset."
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          {error}
        </Alert>
      )}

      <Paper
        component="form"
        onSubmit={handleSubmit}
        variant="outlined"
        sx={{ p: 3, borderRadius: 4, display: 'grid', gap: 2, bgcolor: 'rgba(255,255,255,0.8)' }}
      >
        <Tabs
          value={mode}
          onChange={(_, v: 'single' | 'series') => setMode(v)}
          sx={{
            bgcolor: 'rgba(19,35,37,0.06)',
            borderRadius: 999,
            minHeight: 0,
            p: 0.5,
            // Hug the two tabs. A fixed max-width left bare pill background
            // beside them, which looked exactly like an empty third tab.
            width: 'fit-content',
            '& .MuiTabs-indicator': { display: 'none' },
            '& .MuiTab-root': { borderRadius: 999, minHeight: 40, fontWeight: 600 },
            '& .Mui-selected': { bgcolor: 'primary.main', color: '#fff !important' },
          }}
        >
          <Tab label="Single session" value="single" />
          <Tab label="Repeat series" value="series" />
        </Tabs>

        {mode === 'single' ? (
          <>
            <TextField
              label="Session name (optional)"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={`Blank shows the activity name: ${activity?.name ?? ''}`}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField
                label="Date"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
              />
              <TextField
                label="Start time"
                type="time"
                required
                InputLabelProps={{ shrink: true }}
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
              />
            </Box>
          </>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField
                label="First date"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                value={form.startDate}
                onChange={(e) => set('startDate', e.target.value)}
              />
              <TextField
                label="Last date"
                type="date"
                required
                InputLabelProps={{ shrink: true }}
                value={form.endDate}
                onChange={(e) => set('endDate', e.target.value)}
              />
              <TextField select label="Repeats" value={form.pattern} onChange={(e) => set('pattern', e.target.value as 'weekly' | 'monthly')}>
                <MenuItem value="weekly">Weekly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </TextField>
            </Box>
            <TextField
              label="Start time"
              type="time"
              required
              InputLabelProps={{ shrink: true }}
              value={form.startTime}
              onChange={(e) => set('startTime', e.target.value)}
              sx={{ maxWidth: 220 }}
            />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
              Series sessions are created as drafts so you can review each before it opens for
              enrollment.
            </Typography>
          </>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Duration (hours)"
            type="number"
            inputProps={{ min: 0.5, max: 24, step: 0.5 }}
            value={form.durationHours}
            onChange={(e) => set('durationHours', e.target.value)}
          />
          <TextField
            label="Max volunteers"
            type="number"
            inputProps={{ min: 1 }}
            value={form.maxSlots}
            onChange={(e) => set('maxSlots', e.target.value)}
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2 }}>
          <TextField
            label="Location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />
          <TextField label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Box>
        <TextField
          select
          label="Coordinator"
          value={form.coordinatorId}
          onChange={(e) => set('coordinatorId', e.target.value)}
          helperText="Blank uses the program's default coordinator"
        >
          <MenuItem value="">Program default</MenuItem>
          {coordinators
            .filter((c) => c.isActive)
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} — {c.email}
              </MenuItem>
            ))}
        </TextField>

        {mode === 'single' && (
          <TextField
            select
            label="Visibility"
            value={form.publishNow ? 'publish' : 'draft'}
            onChange={(e) => set('publishNow', e.target.value === 'publish')}
            sx={{ maxWidth: 340 }}
          >
            <MenuItem value="publish">Publish — open for enrollment immediately</MenuItem>
            <MenuItem value="draft">Save as draft</MenuItem>
          </TextField>
        )}

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
          <Button variant="pillOutlined" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button variant="pill" type="submit" disabled={busy}>
            {busy ? 'Scheduling…' : mode === 'single' ? 'Schedule session' : 'Create series'}
          </Button>
        </Box>
      </Paper>
    </PageShell>
  );
}
