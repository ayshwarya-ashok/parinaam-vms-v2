import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { api, asApiError } from '@/api/client';
import { ResetSummary, useDataToolsStatus } from '@/api/admin';
import { useAuth } from '@/app/auth';
import { PageShell, StatTile } from '@/components';

/**
 * Round 49 — Data Tools (admin only, behind DATA_TOOLS_ENABLED). One action:
 * reset the database to the client baseline. The page says exactly what stays
 * and what goes, and the button arms only after the word RESET is typed.
 */
export function DataTools() {
  const { user } = useAuth();
  const { data: status, isLoading } = useDataToolsStatus(user?.role === 'admin');
  const [confirmText, setConfirmText] = useState('');
  const [summary, setSummary] = useState<ResetSummary | null>(null);
  const { enqueueSnackbar } = useSnackbar();
  const queryClient = useQueryClient();

  const reset = useMutation({
    mutationFn: async () =>
      (await api.post<ResetSummary>('/data-tools/reset', { confirm: 'RESET' })).data,
    onSuccess: (result) => {
      setSummary(result);
      setConfirmText('');
      // Every cached list is stale now — refetch the world.
      void queryClient.invalidateQueries();
      enqueueSnackbar('Data reset to the client baseline', { variant: 'success' });
    },
    onError: (err) =>
      enqueueSnackbar(asApiError(err)?.message ?? 'Reset failed', { variant: 'error' }),
  });

  return (
    <PageShell
      title="Data Tools"
      description="Operational tools for the demo environment. Everything here is deliberate, audited, and admin-only."
    >
      {isLoading && <CircularProgress color="secondary" />}

      {status && !status.enabled && (
        <Alert severity="info" sx={{ borderRadius: 3, maxWidth: 640 }}>
          Data tools are turned off on this server. Set <code>DATA_TOOLS_ENABLED=true</code> in
          the environment and restart the API to enable them.
        </Alert>
      )}

      {status?.enabled && (
        <Box sx={{ display: 'grid', gap: 2, maxWidth: 760 }}>
          <Paper
            variant="outlined"
            sx={{ p: 3, borderRadius: 3, borderColor: 'rgba(139,26,26,0.35)' }}
          >
            <Typography variant="h6" sx={{ mb: 0.5 }}>⟲ Reset to the client baseline</Typography>
            <Typography sx={{ fontSize: '0.9rem', color: 'text.secondary', mb: 1.5 }}>
              Returns the database to the client-document demo state, in one transaction:
            </Typography>
            <Box component="ul" sx={{ m: 0, mb: 1.5, pl: 2.5, fontSize: '0.88rem', color: 'text.secondary', display: 'grid', gap: 0.5 }}>
              <li>
                <strong>Kept:</strong> the client catalog — AAP, Chote Kadam and Activity-Based
                Volunteering (3 programs, 4 activities, 5 sessions, restored to their canonical
                state even if renamed, cancelled or deleted since) — plus 10 curated volunteers,
                the primary admin, 3 field coordinators, trainings, coordinators and the audit trail.
              </li>
              <li>
                <strong>Removed:</strong> every other program, activity and session; every other
                volunteer account; all enrollments, waitlists, attendance, coordinator reports,
                certificates (files included), feedback and email logs.
              </li>
            </Box>
            <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>
              This cannot be undone. The reset touches <strong>only the database</strong> — it
              runs in place, nothing is restarted, and the app stays up throughout.
            </Alert>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                size="small"
                label="Type RESET to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                sx={{ width: 220 }}
              />
              <Button
                variant="pill"
                sx={{ bgcolor: '#8B1A1A', background: 'linear-gradient(135deg, #a83232 0%, #8B1A1A 100%)' }}
                disabled={confirmText !== 'RESET' || reset.isPending}
                onClick={() => reset.mutate()}
              >
                {reset.isPending ? 'Resetting…' : '⟲ Reset data'}
              </Button>
            </Box>
          </Paper>

          {summary && (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h6" sx={{ mb: 1.5 }}>After the reset</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                <StatTile label="Programs" value={summary.programs} />
                <StatTile label="Activities" value={summary.activities} />
                <StatTile label="Sessions" value={summary.sessions} />
                <StatTile label="Volunteers" value={summary.volunteers} />
                <StatTile label="Field coordinators" value={summary.fieldCoordinators} />
                <StatTile label="Admins" value={summary.admins} />
              </Box>
            </Paper>
          )}
        </Box>
      )}
    </PageShell>
  );
}
