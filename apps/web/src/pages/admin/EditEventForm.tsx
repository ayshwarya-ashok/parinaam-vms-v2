import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { useCoordinators } from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { useDynamicCrumbs } from '@/app/breadcrumbs';
import { PageShell, StatusPill } from '@/components';
import { tokens } from '@/theme';

interface EventAdminDetail {
  id: string;
  code: string;
  name: string | null;
  date: string;
  start_time: string;
  duration_hours: string | null;
  location: string | null;
  city: string | null;
  max_slots: number | null;
  coordinator_id: string;
  status: 'draft' | 'upcoming' | 'completed' | 'cancelled';
  activity_id: string;
  activity_name: string;
  program_id: string;
  program_name: string;
  enrolled_count: number;
  waitlist_count: number;
}

/**
 * Edit one occurrence.
 *
 * Deliberately narrower than the scheduling form: this edits a date that
 * people have already been told about. Anything that would silently move a
 * commitment — the date, the time, a capacity below the number already
 * enrolled — is called out rather than quietly accepted.
 */
export function EditEventForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: coordinators = [] } = useCoordinators();

  const { data: event } = useQuery({
    queryKey: ['event-admin', id],
    queryFn: async () => (await api.get<EventAdminDetail>(`/events/${id}/admin`)).data,
    enabled: !!id,
  });

  useDynamicCrumbs(
    event
      ? [
          { label: 'Programs', to: '/admin/programs' },
          { label: event.program_name, to: `/admin/programs/${event.program_id}` },
          { label: event.activity_name, to: `/admin/activities/${event.activity_id}` },
        ]
      : null,
  );

  const [form, setForm] = useState({
    name: '',
    date: '',
    startTime: '',
    durationHours: '',
    location: '',
    city: '',
    maxSlots: '',
    coordinatorId: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!event) return;
    setForm({
      name: event.name ?? '',
      date: String(event.date).slice(0, 10),
      startTime: event.start_time?.slice(0, 5) ?? '',
      durationHours: event.duration_hours ? String(Number(event.duration_hours)) : '',
      location: event.location ?? '',
      city: event.city ?? '',
      maxSlots: event.max_slots === null ? '' : String(event.max_slots),
      coordinatorId: event.coordinator_id ?? '',
    });
  }, [event]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  if (!event) {
    return (
      <PageShell eyebrow="Admin" title="Edit occurrence">
        <span />
      </PageShell>
    );
  }

  const originalDate = String(event.date).slice(0, 10);
  const originalTime = event.start_time?.slice(0, 5) ?? '';
  const rescheduling =
    (form.date !== '' && form.date !== originalDate) ||
    (form.startTime !== '' && form.startTime !== originalTime);
  const shrinkingBelowEnrolled =
    form.maxSlots !== '' && Number(form.maxSlots) < event.enrolled_count;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (shrinkingBelowEnrolled) {
      setError(
        `${event.enrolled_count} volunteer(s) are already enrolled — capacity cannot go below that. Cancel the session instead if it must shrink.`,
      );
      return;
    }

    setBusy(true);
    try {
      await api.patch(`/events/${id}`, {
        name: form.name || undefined,
        date: form.date,
        startTime: form.startTime,
        durationHours: form.durationHours ? Number(form.durationHours) : undefined,
        location: form.location || undefined,
        city: form.city || undefined,
        maxSlots: form.maxSlots ? Number(form.maxSlots) : undefined,
        coordinatorId: form.coordinatorId || undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ['activity', event.activity_id] });
      void queryClient.invalidateQueries({ queryKey: ['event-admin', id] });
      void queryClient.invalidateQueries({ queryKey: ['session-record', id] });
      void queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      enqueueSnackbar('Session updated', { variant: 'success' });
      navigate(`/admin/activities/${event.activity_id}`);
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not save the changes.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow={`Admin › ${event.program_name} › ${event.activity_name}`}
      title="Edit Occurrence"
      description={`${event.code} — changes apply to this session only, not to the rest of the series.`}
      actions={<StatusPill status={event.status} />}
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          {error}
        </Alert>
      )}

      {event.enrolled_count > 0 && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 3 }}>
          {event.enrolled_count} volunteer{event.enrolled_count === 1 ? '' : 's'} already enrolled
          {event.waitlist_count > 0 ? `, ${event.waitlist_count} waiting` : ''}.{' '}
          <Box component={RouterLink} to={`/admin/sessions/${event.id}`} sx={{ color: 'inherit' }}>
            See who
          </Box>
          .
        </Alert>
      )}

      {rescheduling && event.enrolled_count > 0 && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          You are moving a session people have already committed to. Saving does <strong>not</strong>{' '}
          email them — tell them yourself, or cancel this session and schedule a new one so the
          cancellation notice goes out automatically.
        </Alert>
      )}

      <Paper
        component="form"
        onSubmit={handleSubmit}
        variant="outlined"
        sx={{ p: 3, borderRadius: 4, display: 'grid', gap: 2, bgcolor: 'rgba(255,255,255,0.8)' }}
      >
        <TextField
          label="Session name (optional)"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          helperText={`Left blank, the session shows as "${event.activity_name}"`}
        />

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
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
          <TextField
            label="Duration (hours)"
            type="number"
            inputProps={{ min: 0.5, step: 0.5 }}
            value={form.durationHours}
            onChange={(e) => set('durationHours', e.target.value)}
          />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2 }}>
          <TextField
            label="Location"
            value={form.location}
            onChange={(e) => set('location', e.target.value)}
          />
          <TextField label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 2 }}>
          <TextField
            label="Max slots"
            type="number"
            inputProps={{ min: 1 }}
            value={form.maxSlots}
            onChange={(e) => set('maxSlots', e.target.value)}
            error={shrinkingBelowEnrolled}
            helperText={
              shrinkingBelowEnrolled
                ? `${event.enrolled_count} already enrolled`
                : 'Raising this promotes people off the waitlist automatically'
            }
          />
          <TextField
            select
            label="Coordinator"
            value={form.coordinatorId}
            onChange={(e) => set('coordinatorId', e.target.value)}
          >
            {coordinators.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 1 }}>
          <Button
            variant="pillOutlined"
            onClick={() => navigate(`/admin/activities/${event.activity_id}`)}
          >
            Cancel
          </Button>
          <Button variant="pill" type="submit" disabled={busy || shrinkingBelowEnrolled}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </Box>
      </Paper>

      {event.status === 'draft' && (
        <Typography sx={{ mt: 2, fontSize: '0.85rem', color: tokens.textMuted }}>
          This session is still a <strong>draft</strong> — volunteers cannot see or join it until
          you publish it from the activity page.
        </Typography>
      )}
    </PageShell>
  );
}
