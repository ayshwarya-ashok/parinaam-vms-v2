import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { useTraining, useTrainingInvalidation } from '@/api/trainings';
import { PageShell } from '@/components';

interface QuestionDraft {
  questionText: string;
  correctOptionIndex: number;
  options: string[];
}

export function TrainingForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useTrainingInvalidation();
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: existing, refetch } = useTraining(isEdit ? id : undefined);

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: '2h',
    mode: 'Online' as 'Online' | 'In person',
    category: 'activity' as 'compliance' | 'activity',
    passingScore: '70',
    isMandatory: false,
    maxAttempts: '3',
    expiryMonths: '12',
  });
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetPrompt, setResetPrompt] = useState(false);

  useEffect(() => {
    if (existing && isEdit) {
      setForm({
        name: existing.name,
        description: existing.description ?? '',
        duration: existing.duration,
        mode: existing.mode,
        category: existing.category,
        passingScore: String(existing.passingScore),
        isMandatory: existing.isMandatory,
        maxAttempts: String(existing.maxAttempts ?? 3),
        expiryMonths: String(existing.expiryMonths ?? 12),
      });
      setQuestions(
        existing.questions.map((q) => ({
          questionText: q.questionText,
          correctOptionIndex: q.correctOptionIndex ?? 0,
          options: q.options.map((o) => o.text),
        })),
      );
    }
  }, [existing, isEdit]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return (
        await api.post<{ requiresResetDecision: boolean; material: { name: string } }>(
          `/trainings/${id}/materials`,
          body,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        )
      ).data;
    },
    onSuccess: (data) => {
      void refetch();
      invalidate();
      enqueueSnackbar(`${data.material.name} uploaded`, { variant: 'success' });
      // BR-12: new content on a mandatory training — the admin decides.
      if (data.requiresResetDecision) setResetPrompt(true);
    },
    onError: (err) => setError(asApiError(err)?.message ?? 'Upload failed.'),
  });

  const removeMaterial = useMutation({
    mutationFn: async (materialId: string) =>
      (await api.delete(`/trainings/${id}/materials/${materialId}`)).data,
    onSuccess: () => {
      void refetch();
      invalidate();
    },
  });

  const resetAll = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ volunteers: number; attemptsCleared: number }>(
          `/trainings/${id}/assessments/reset-all`,
          { reason: 'Training materials updated' },
        )
      ).data,
    onSuccess: (data) => {
      setResetPrompt(false);
      invalidate();
      enqueueSnackbar(
        `Assessments reset for ${data.volunteers} volunteer(s) — ${data.attemptsCleared} attempt(s) superseded`,
        { variant: 'warning' },
      );
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      duration: form.duration,
      mode: form.mode,
      category: form.category,
      passingScore: Number(form.passingScore),
      isMandatory: form.isMandatory,
      maxAttempts: form.isMandatory ? Number(form.maxAttempts) : undefined,
      expiryMonths: form.isMandatory ? Number(form.expiryMonths) : undefined,
    };
    try {
      let trainingId = id;
      if (isEdit) {
        await api.patch(`/trainings/${id}`, payload);
      } else {
        trainingId = (await api.post<{ id: string }>('/trainings', payload)).data.id;
      }
      if (questions.length > 0) {
        await api.put(`/trainings/${trainingId}/questions`, { questions });
      }
      invalidate();
      enqueueSnackbar(isEdit ? 'Training updated' : 'Training created — add materials next', {
        variant: 'success',
      });
      navigate(isEdit ? '/admin/trainings' : `/admin/trainings/${trainingId}/edit`);
    } catch (err) {
      setError(asApiError(err)?.message ?? 'Could not save the training.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow={`Admin › Trainings › ${isEdit ? 'Edit' : 'New'}`}
      title={isEdit ? 'Edit Training' : 'Add Training'}
      maxWidth="md"
    >
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper
        component="form"
        onSubmit={handleSubmit}
        variant="outlined"
        sx={{ p: 3, borderRadius: 4, display: 'grid', gap: 2, bgcolor: 'rgba(255,255,255,0.8)' }}
      >
        <TextField label="Training name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="Description" multiline minRows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
          <TextField select label="Category" value={form.category} onChange={(e) => set('category', e.target.value as typeof form.category)}>
            <MenuItem value="compliance">Compliance</MenuItem>
            <MenuItem value="activity">Activity</MenuItem>
          </TextField>
          <TextField label="Duration" value={form.duration} onChange={(e) => set('duration', e.target.value)} placeholder="e.g. 2h" />
          <TextField select label="Mode" value={form.mode} onChange={(e) => set('mode', e.target.value as typeof form.mode)}>
            <MenuItem value="Online">Online</MenuItem>
            <MenuItem value="In person">In person</MenuItem>
          </TextField>
          <TextField label="Passing score (%)" type="number" inputProps={{ min: 1, max: 100 }} value={form.passingScore} onChange={(e) => set('passingScore', e.target.value)} />
        </Box>

        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.5)' }}>
          <FormControlLabel
            control={<Checkbox checked={form.isMandatory} onChange={(e) => set('isMandatory', e.target.checked)} />}
            label={
              <Typography sx={{ fontSize: '0.92rem' }}>
                <strong>Mandatory compliance training</strong> — gates all enrollment (BR-03 requires a cap and an expiry)
              </Typography>
            }
          />
          {form.isMandatory && (
            <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
              <TextField label="Max attempts" type="number" inputProps={{ min: 1 }} value={form.maxAttempts} onChange={(e) => set('maxAttempts', e.target.value)} sx={{ maxWidth: 160 }} />
              <TextField label="Expiry (months)" type="number" inputProps={{ min: 1 }} value={form.expiryMonths} onChange={(e) => set('expiryMonths', e.target.value)} sx={{ maxWidth: 160 }} />
            </Box>
          )}
        </Paper>

        {isEdit && (
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 1 }}>Materials</Typography>
            <Box sx={{ display: 'grid', gap: 0.75, mb: 1 }}>
              {(existing?.materials ?? []).map((m) => (
                <Paper key={m.id} variant="outlined" sx={{ px: 1.5, py: 0.75, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography sx={{ flex: 1, fontSize: '0.9rem' }}>
                    {m.name} <span style={{ color: '#5e6a62' }}>· {m.fileSizeText}</span>
                  </Typography>
                  <IconButton size="small" onClick={() => removeMaterial.mutate(m.id)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Paper>
              ))}
            </Box>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept=".pdf,.ppt,.pptx,.doc,.docx,.mp4,.webm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
            <Button variant="pillOutlined" size="small" onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
              {upload.isPending ? 'Uploading…' : '+ Upload material'}
            </Button>
          </Box>
        )}

        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.92rem', mb: 1 }}>
            Quiz questions ({questions.length})
          </Typography>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {questions.map((q, qi) => (
              <Paper key={qi} variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'text.secondary' }}>
                    Q{qi + 1}
                  </Typography>
                  <TextField
                    fullWidth
                    placeholder="Question text…"
                    value={q.questionText}
                    onChange={(e) =>
                      setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, questionText: e.target.value } : x)))
                    }
                  />
                  <IconButton size="small" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  {q.options.map((option, oi) => (
                    <Box key={oi} sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                      <Radio
                        size="small"
                        checked={q.correctOptionIndex === oi}
                        onChange={() =>
                          setQuestions((qs) => qs.map((x, i) => (i === qi ? { ...x, correctOptionIndex: oi } : x)))
                        }
                        title="Mark as the correct answer"
                      />
                      <TextField
                        fullWidth
                        size="small"
                        placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                        value={option}
                        onChange={(e) =>
                          setQuestions((qs) =>
                            qs.map((x, i) =>
                              i === qi ? { ...x, options: x.options.map((o, j) => (j === oi ? e.target.value : o)) } : x,
                            ),
                          )
                        }
                      />
                    </Box>
                  ))}
                </Box>
              </Paper>
            ))}
          </Box>
          <Button
            variant="pillOutlined"
            size="small"
            sx={{ mt: 1 }}
            onClick={() =>
              setQuestions((qs) => [...qs, { questionText: '', correctOptionIndex: 0, options: ['', '', '', ''] }])
            }
          >
            + Add question
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
          <Button variant="pillOutlined" onClick={() => navigate('/admin/trainings')}>
            Cancel
          </Button>
          <Button variant="pill" type="submit" disabled={busy || !form.name.trim()}>
            {busy ? 'Saving…' : 'Save training'}
          </Button>
        </Box>
      </Paper>

      {/* BR-12 — the reset-or-keep decision after new content on a mandatory training */}
      <Dialog open={resetPrompt} onClose={() => setResetPrompt(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 460 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          📄 New document added
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: 'text.secondary' }}>
            You added new material to <strong>{form.name}</strong>, a mandatory training. Should
            existing assessment scores be reset so volunteers retake the quiz against the updated
            content? History is preserved either way — resets supersede, never delete.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setResetPrompt(false)}>
            Keep existing scores
          </Button>
          <Button
            variant="pill"
            sx={{ background: 'linear-gradient(135deg,#c0442a,#9a3620)' }}
            onClick={() => resetAll.mutate()}
            disabled={resetAll.isPending}
          >
            {resetAll.isPending ? 'Resetting…' : 'Reset assessments'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
