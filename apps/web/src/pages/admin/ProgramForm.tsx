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
import {
  useCoordinators,
  useInvalidateProgram,
  useProgram,
  useTrainingsCatalog,
} from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { isUnchanged, useToast } from '@/app/toast';
import { PageShell } from '@/components';

/** Create and edit share this form; the id param decides. */
export function ProgramForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateProgram();

  const { data: existing } = useProgram(id);
  const { data: coordinators = [] } = useCoordinators();
  const { data: catalog = [] } = useTrainingsCatalog();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Optional planned window (Round 45) — informational, never gates enrollment.
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [trainingIds, setTrainingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [original, setOriginal] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setStartDate(existing.startDate ? String(existing.startDate).slice(0, 10) : '');
      setEndDate(existing.endDate ? String(existing.endDate).slice(0, 10) : '');
      setCoordinatorId(existing.defaultCoordinator?.id ?? '');
      setTrainingIds(existing.trainings.map((t) => t.id));
      setOriginal({
        name: existing.name,
        description: existing.description ?? '',
        startDate: existing.startDate ? String(existing.startDate).slice(0, 10) : '',
        endDate: existing.endDate ? String(existing.endDate).slice(0, 10) : '',
        coordinatorId: existing.defaultCoordinator?.id ?? '',
        trainingIds: existing.trainings.map((t) => t.id),
      });
    }
  }, [existing, isEdit]);

  const toggleTraining = (tid: string) =>
    setTrainingIds((ids) => (ids.includes(tid) ? ids.filter((x) => x !== tid) : [...ids, tid]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim() === '') {
      setNameError('A program needs a name.');
      toast.failure('Check the highlighted fields.');
      return;
    }
    setNameError(null);
    if (description.trim() === '') {
      setError('A description is required — it is what reviewers and volunteers read.');
      toast.failure('A description is required.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('The end date is before the start date.');
      toast.failure('The end date is before the start date.');
      return;
    }

    if (isEdit && original && isUnchanged({ name, description, startDate, endDate, coordinatorId, trainingIds }, original)) {
      toast.noChanges();
      return;
    }

    setBusy(true);
    try {
      if (isEdit) {
        await api.patch(`/programs/${id}`, {
          name,
          description: description.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          defaultCoordinatorId: coordinatorId || undefined,
        });
        await api.put(`/programs/${id}/trainings`, { trainingIds });
        invalidate(id);
        toast.success('Program updated');
        navigate(`/admin/programs/${id}`);
      } else {
        const { data } = await api.post<{ id: string }>('/programs', {
          name,
          description: description.trim(),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          defaultCoordinatorId: coordinatorId || undefined,
          trainingIds,
        });
        invalidate();
        toast.success('Program created as a draft — publish it when ready');
        navigate(`/admin/programs/${data.id}`);
      }
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not save the program.');
      toast.failure(err, 'Could not save the program.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      title={isEdit ? 'Edit Program' : 'Add Program'}
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
          label="Program name"
          required
          error={Boolean(nameError)}
          helperText={nameError ?? undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Community Health Camp"
        />
        <TextField
          label="Description"
          required
          multiline
          minRows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this initiative about?"
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <TextField
            label="Start date (optional)"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            helperText="The planned window — informational; sessions carry the real dates"
          />
          <TextField
            label="End date (optional)"
            type="date"
            InputLabelProps={{ shrink: true }}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Box>
        <TextField
          select
          label="Default coordinator (proposed when scheduling sessions)"
          value={coordinatorId}
          onChange={(e) => setCoordinatorId(e.target.value)}
        >
          <MenuItem value="">None</MenuItem>
          {coordinators
            .filter((c) => c.isActive)
            .map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name} — {c.email}
              </MenuItem>
            ))}
        </TextField>

        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem' }}>
            Program-level trainings
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mb: 1 }}>
            Required by every activity under this program. Activity-specific trainings are linked
            on the activity itself.
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
                  bgcolor: trainingIds.includes(t.id) ? 'rgba(10,170,186,0.1)' : 'rgba(255,255,255,0.6)',
                  borderColor: trainingIds.includes(t.id) ? 'rgba(10,170,186,0.6)' : undefined,
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
                      <span style={{ color: '#5E6E7E' }}>
                        {' '}
                        · {t.duration} · {t.mode}
                        {t.isMandatory ? ' · mandatory compliance' : ''}
                      </span>
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
          <Button variant="pill" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create program'}
          </Button>
        </Box>
      </Paper>
    </PageShell>
  );
}
