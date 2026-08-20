import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useMutation } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAssessments, useTraining, useTrainingInvalidation } from '@/api/trainings';
import { ConfirmDialog, FilterBar, PageShell } from '@/components';
import { tokens } from '@/theme';

function Pips({ used, max, passed }: { used: number; max: number | null; passed: boolean }) {
  const total = max ?? Math.max(used, 1);
  return (
    <Box sx={{ display: 'flex', gap: 0.4, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <Box
          key={i}
          sx={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor:
              i < used
                ? passed && i === used - 1
                  ? tokens.success
                  : alpha(tokens.accentStrong, 0.55)
                : 'rgba(19,35,37,0.12)',
          }}
        />
      ))}
      <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary', ml: 0.5 }}>
        {used}/{max ?? '∞'}
      </Typography>
    </Box>
  );
}

export function AssessmentsPage() {
  const { id } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();
  const invalidate = useTrainingInvalidation();

  const [status, setStatus] = useState('all');
  const [resetTarget, setResetTarget] = useState<{ volunteerId: string; name: string } | null>(null);

  const { data: training } = useTraining(id);
  const { data: rows = [] } = useAssessments(id!, status);

  const reset = useMutation({
    mutationFn: async (volunteerId: string) =>
      (
        await api.post<{ cleared: number }>(`/trainings/${id}/assessments/reset`, {
          volunteerId,
          reason: 'Admin reset from the assessment table',
        })
      ).data,
    onSuccess: (data, _volunteerId) => {
      invalidate();
      setResetTarget(null);
      enqueueSnackbar(
        `${data.cleared} attempt(s) superseded — the volunteer can retake from attempt 1 of the cap`,
        { variant: 'success' },
      );
    },
  });

  return (
    <PageShell
      eyebrow="Admin › Trainings › Assessments"
      title={`${training?.name ?? ''} — Assessment Status`}
      description={
        training
          ? `Mandatory training · ${training.maxAttempts ?? '∞'} attempts allowed · passing score ${training.passingScore}% · ${training.expiryMonths ?? '—'}-month validity. Resets supersede history; nothing is deleted.`
          : undefined
      }
    >
      <FilterBar
        groups={[
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'passed', label: 'Passed' },
              { value: 'failed', label: 'Not passed' },
              { value: 'exhausted', label: 'Attempts exhausted' },
            ],
          },
        ]}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Volunteer</TableCell>
              <TableCell>Attempts used</TableCell>
              <TableCell>Scores</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Valid until</TableCell>
              <TableCell align="right">Admin actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.volunteerId}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>{r.email}</Typography>
                </TableCell>
                <TableCell>
                  <Pips used={r.attemptsUsed} max={r.maxAttempts} passed={r.passed} />
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: '0.85rem' }}>
                    {r.scores.length ? r.scores.map((s) => `${s}%`).join(', ') : '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  {r.passed ? (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.success }}>✓ Passed</Typography>
                  ) : r.exhausted ? (
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: tokens.accentStrong }}>🚫 Exhausted</Typography>
                  ) : (
                    <Typography sx={{ fontSize: '0.82rem', color: 'text.secondary' }}>● Not passed</Typography>
                  )}
                </TableCell>
                <TableCell>{r.expiryDate ? String(r.expiryDate).slice(0, 10) : '—'}</TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 2, py: 0.4 }}
                    onClick={() => setResetTarget({ volunteerId: r.volunteerId, name: r.name })}
                  >
                    ↻ Reset attempts
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No records match the selected filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>


      <ConfirmDialog
        open={resetTarget !== null}
        title={`Reset attempts for ${resetTarget?.name}?`}
        message="Their attempts are marked superseded — retained for audit but no longer counted — and they can retake from a clean slate. Losing a compliance pass may return them to the In Training phase."
        confirmLabel="Reset attempts"
        danger
        onConfirm={() => resetTarget && reset.mutate(resetTarget.volunteerId)}
        onCancel={() => setResetTarget(null)}
      />
    </PageShell>
  );
}
