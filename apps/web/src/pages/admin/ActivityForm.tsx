import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useActivity, useInvalidateProgram, useTrainingsCatalog } from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { isUnchanged, useToast } from '@/app/toast';
import { PageShell } from '@/components';

/**
 * The activity is the undated definition. Its defaults seed each scheduled
 * session; the session's own values are authoritative once set.
 */
export function ActivityForm() {
  // create: /admin/programs/:programId/activities/new — edit: /admin/activities/:id/edit
  const { programId, id } = useParams<{ programId?: string; id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateProgram();

  const { data: existing } = useActivity(isEdit ? id : undefined);
  const { data: catalog = [] } = useTrainingsCatalog();

  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'In person' as 'In person' | 'Online',
    outcome: '',
    skillRequired: '',
    defaultDurationHours: '2',
    defaultMaxSlots: '10',
    defaultLocation: '',
  });
  const [trainingIds, setTrainingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [original, setOriginal] = useState<typeof form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        name: existing.name,
        description: existing.description ?? '',
        type: existing.type,
        outcome: existing.outcome ?? '',
        skillRequired: existing.skillRequired ?? '',
        defaultDurationHours: existing.defaultDurationHours ?? '2',
        defaultMaxSlots: String(existing.defaultMaxSlots ?? 10),
        defaultLocation: existing.defaultLocation ?? '',
      });
      setTrainingIds(existing.trainings.map((t) => t.id));
      setOriginal({
        name: existing.name,
        description: existing.description ?? '',
        type: existing.type,
        outcome: existing.outcome ?? '',
        skillRequired: existing.skillRequired ?? '',
        defaultDurationHours: existing.defaultDurationHours ?? '2',
        defaultMaxSlots: String(existing.defaultMaxSlots ?? 10),
        defaultLocation: existing.defaultLocation ?? '',
      });
    }
  }, [existing, isEdit]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (key === 'name') setNameError(null);
  };

  const toggleTraining = (tid: string) =>
    setTrainingIds((ids) => (ids.includes(tid) ? ids.filter((x) => x !== tid) : [...ids, tid]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.name.trim() === '') {
      setNameError('An activity needs a name.');
      toast.failure('Check the highlighted fields.');
      return;
    }
    setNameError(null);

    if (isEdit && original && isUnchanged(form, original)) {
      toast.noChanges();
      return;
    }
    setBusy(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      type: form.type,
      outcome: form.outcome || undefined,
      skillRequired: form.skillRequired || undefined,
      defaultDurationHours: Number(form.defaultDurationHours) || undefined,
      defaultMaxSlots: Number(form.defaultMaxSlots) || undefined,
      defaultLocation: form.defaultLocation || undefined,
      trainingIds,
    };
    try {
      if (isEdit) {
        await api.patch(`/activities/${id}`, payload);
        invalidate(existing?.programId);
        toast.success('Activity updated');
        navigate(`/admin/activities/${id}`);
      } else {
        const { data } = await api.post<{ id: string }>(
          `/programs/${programId}/activities`,
          payload,
        );
        invalidate(programId);
        toast.success('Activity created — now schedule its first session');
        navigate(`/admin/activities/${data.id}`);
      }
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not save the activity.');
      toast.failure(err, 'Could not save the activity.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow={`Admin › Programs › ${isEdit ? 'Edit Activity' : 'Add Activity'}`}
      title={isEdit ? 'Edit Activity' : 'Add Activity'}
      description="An activity is the repeatable definition — what the work is and what it requires. Dates, capacity and coordinator belong to each scheduled session."
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
        <TextField
          label="Activity name"
          required
          error={Boolean(nameError)}
          helperText={nameError ?? undefined}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="e.g. Blood Pressure Screening"
        />
        <TextField
          label="Description"
          multiline
          minRows={2}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <TextField select label="Type" value={form.type} onChange={(e) => set('type', e.target.value as 'In person' | 'Online')}>
            <MenuItem value="In person">In person</MenuItem>
            <MenuItem value="Online">Online</MenuItem>
          </TextField>
          <TextField
            label="Skill required"
            value={form.skillRequired}
            onChange={(e) => set('skillRequired', e.target.value)}
            placeholder="e.g. First aid, Teaching"
          />
        </Box>
        <TextField
          label="Expected outcome"
          multiline
          minRows={2}
          value={form.outcome}
          onChange={(e) => set('outcome', e.target.value)}
          placeholder="Describe the expected impact…"
        />

        <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', mt: 1 }}>
          Session defaults <span style={{ fontWeight: 400, color: '#5e6a62' }}>— pre-filled when scheduling; each session can override them</span>
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 2fr' }, gap: 2 }}>
          <TextField
            label="Duration (hours)"
            type="number"
            inputProps={{ min: 0.5, max: 24, step: 0.5 }}
            value={form.defaultDurationHours}
            onChange={(e) => set('defaultDurationHours', e.target.value)}
          />
          <TextField
            label="Max volunteers"
            type="number"
            inputProps={{ min: 1 }}
            value={form.defaultMaxSlots}
            onChange={(e) => set('defaultMaxSlots', e.target.value)}
          />
          <TextField
            label="Location"
            value={form.defaultLocation}
            onChange={(e) => set('defaultLocation', e.target.value)}
            placeholder="Block, room or online link"
          />
        </Box>

        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
            Activity-specific trainings
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 1 }}>
            The enrollment gate is the union of these and the program-level trainings.
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {catalog.map((t) => (
              <Paper
                key={t.id}
                variant="outlined"
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 2,
                  bgcolor: trainingIds.includes(t.id) ? 'rgba(141,184,166,0.1)' : 'rgba(255,255,255,0.6)',
                  borderColor: trainingIds.includes(t.id) ? 'rgba(141,184,166,0.6)' : undefined,
                }}
              >
                <FormControlLabel
                  sx={{ width: '100%' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={trainingIds.includes(t.id)}
                      onChange={() => toggleTraining(t.id)}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: '0.9rem' }}>
                      <strong>{t.name}</strong>
                      <span style={{ color: '#5e6a62' }}> · {t.duration} · {t.mode}</span>
                    </Typography>
                  }
                />
              </Paper>
            ))}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
          <Button variant="pillOutlined" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button variant="pill" type="submit" disabled={busy || !form.name.trim()}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create activity'}
          </Button>
        </Box>
      </Paper>
    </PageShell>
  );
}
