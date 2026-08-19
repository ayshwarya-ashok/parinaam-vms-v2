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
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  useCoordinators,
  useInvalidateProgram,
  useProgram,
  useTrainingsCatalog,
} from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { PageShell } from '@/components';

/** Create and edit share this form; the id param decides. */
export function ProgramForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useInvalidateProgram();

  const { data: existing } = useProgram(id);
  const { data: coordinators = [] } = useCoordinators();
  const { data: catalog = [] } = useTrainingsCatalog();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coordinatorId, setCoordinatorId] = useState('');
  const [trainingIds, setTrainingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setName(existing.name);
      setDescription(existing.description ?? '');
      setCoordinatorId(existing.defaultCoordinator?.id ?? '');
      setTrainingIds(existing.trainings.map((t) => t.id));
    }
  }, [existing, isEdit]);

  const toggleTraining = (tid: string) =>
    setTrainingIds((ids) => (ids.includes(tid) ? ids.filter((x) => x !== tid) : [...ids, tid]));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isEdit) {
        await api.patch(`/programs/${id}`, {
          name,
          description: description || undefined,
          defaultCoordinatorId: coordinatorId || undefined,
        });
        await api.put(`/programs/${id}/trainings`, { trainingIds });
        invalidate(id);
        enqueueSnackbar('Program updated', { variant: 'success' });
        navigate(`/admin/programs/${id}`);
      } else {
        const { data } = await api.post<{ id: string }>('/programs', {
          name,
          description: description || undefined,
          defaultCoordinatorId: coordinatorId || undefined,
          trainingIds,
        });
        invalidate();
        enqueueSnackbar('Program created as a draft — publish it when ready', {
          variant: 'success',
        });
        navigate(`/admin/programs/${data.id}`);
      }
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not save the program.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow={`Admin › Programs › ${isEdit ? 'Edit' : 'New'}`}
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Community Health Camp"
        />
        <TextField
          label="Description"
          multiline
          minRows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this initiative about?"
        />
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
                      <span style={{ color: '#5e6a62' }}>
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
