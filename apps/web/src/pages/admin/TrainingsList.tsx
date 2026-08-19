import { Box, Button, Chip, Paper, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '@/api/client';
import { useTrainingInvalidation, useTrainingsList } from '@/api/trainings';
import { EmptyState, FilterBar, PageShell, StatusPill } from '@/components';
import { tokens } from '@/theme';

export function TrainingsList() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useTrainingInvalidation();

  const { data: trainings = [], isLoading } = useTrainingsList({
    q: q || undefined,
    category: category === 'all' ? undefined : category,
    status: status === 'all' ? undefined : status,
  });

  const toggle = useMutation({
    mutationFn: async (t: { id: string; status: string }) =>
      (
        await api.post(`/trainings/${t.id}/status`, {
          status: t.status === 'active' ? 'inactive' : 'active',
        })
      ).data,
    onSuccess: (_, t) => {
      invalidate();
      enqueueSnackbar(t.status === 'active' ? 'Training inactivated' : 'Training reactivated', {
        variant: 'info',
      });
    },
  });

  return (
    <PageShell
      eyebrow="Admin › Trainings"
      title="Trainings"
      actions={
        <Button component={RouterLink} to="/admin/trainings/new" variant="pill">
          + Add Training
        </Button>
      }
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search trainings…' }}
        groups={[
          {
            label: 'Category',
            value: category,
            onChange: setCategory,
            options: [
              { value: 'all', label: 'All' },
              { value: 'compliance', label: 'Compliance' },
              { value: 'activity', label: 'Activity' },
            ],
          },
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
          },
        ]}
      />

      {!isLoading && trainings.length === 0 && <EmptyState message="No trainings match." />}

      <Box sx={{ display: 'grid', gap: 1.25 }}>
        {trainings.map((t) => (
          <Paper
            key={t.id}
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.85)', opacity: t.status === 'inactive' ? 0.6 : 1 }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 260 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
                  <Chip
                    label={t.category}
                    size="small"
                    sx={{
                      fontSize: '0.68rem',
                      height: 20,
                      fontWeight: 700,
                      bgcolor: t.category === 'compliance' ? alpha(tokens.accentStrong, 0.1) : alpha(tokens.info, 0.1),
                      color: t.category === 'compliance' ? tokens.accentStrong : tokens.info,
                    }}
                  />
                  {t.isMandatory && (
                    <Chip label="mandatory" size="small" sx={{ fontSize: '0.68rem', height: 20, bgcolor: tokens.accentStrong, color: '#fff', fontWeight: 700 }} />
                  )}
                  <StatusPill status={t.status} />
                </Box>
                {t.description && (
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.88rem', mt: 0.5 }}>
                    {t.description}
                  </Typography>
                )}
                <Typography sx={{ color: 'text.secondary', fontSize: '0.82rem', mt: 0.5 }}>
                  🕐 {t.duration} · {t.mode} · 📄 {t.materialCount ?? 0} materials · ✎{' '}
                  {t.questionCount ?? 0} questions · pass @ {t.passingScore}%
                  {t.isMandatory && ` · max ${t.maxAttempts} attempts · ${t.expiryMonths}-month validity`}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap' }}>
                {t.isMandatory && (
                  <Button component={RouterLink} to={`/admin/trainings/${t.id}/assessments`} variant="pillOutlined" size="small" sx={{ px: 2, py: 0.5 }}>
                    Assessments
                  </Button>
                )}
                <Button component={RouterLink} to={`/admin/trainings/${t.id}/edit`} variant="pillOutlined" size="small" sx={{ px: 2, py: 0.5 }}>
                  Edit
                </Button>
                <Button
                  variant="pillOutlined"
                  size="small"
                  sx={{ px: 2, py: 0.5, color: t.status === 'active' ? 'secondary.dark' : undefined }}
                  onClick={() => toggle.mutate(t)}
                >
                  {t.status === 'active' ? 'Inactivate' : 'Reactivate'}
                </Button>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>
    </PageShell>
  );
}
