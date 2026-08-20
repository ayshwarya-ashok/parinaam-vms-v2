import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useActivity } from '@/api/admin';
import { useDynamicCrumbs } from '@/app/breadcrumbs';
import { api, asApiError } from '@/api/client';
import { ConfirmDialog, PageShell, StatusPill } from '@/components';

function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ActivityDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: activity, isLoading } = useActivity(id);

  // The URL carries no programme segment, so the breadcrumb to the parent
  // programme is injected from the fetched activity.
  useDynamicCrumbs(
    activity
      ? [
          { label: 'Programs', to: '/admin/programs' },
          { label: activity.programName, to: `/admin/programs/${activity.programId}` },
        ]
      : null,
  );

  const [cancelTarget, setCancelTarget] = useState<{ id: string; label: string } | null>(null);
  const [discontinueOpen, setDiscontinueOpen] = useState(false);

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['activity', id] });
    void queryClient.invalidateQueries({ queryKey: ['program'] });
  };

  const publish = useMutation({
    mutationFn: async (eventId: string) => (await api.post(`/events/${eventId}/publish`)).data,
    onSuccess: () => {
      refetch();
      enqueueSnackbar('Session published — volunteers can now enroll', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Publish failed', { variant: 'error' }),
  });

  const cancel = useMutation({
    mutationFn: async (eventId: string) =>
      (await api.post<{ notified: number }>(`/events/${eventId}/cancel`, {})).data,
    onSuccess: (data) => {
      refetch();
      setCancelTarget(null);
      enqueueSnackbar(`Session cancelled — ${data.notified} volunteer(s) notified by email`, {
        variant: 'warning',
      });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Cancel failed', { variant: 'error' }),
  });

  const toggleActivity = useMutation({
    mutationFn: async () =>
      (
        await api.post(
          `/activities/${id}/${activity?.status === 'active' ? 'discontinue' : 'reactivate'}`,
          {},
        )
      ).data,
    onSuccess: () => {
      refetch();
      setDiscontinueOpen(false);
      enqueueSnackbar(
        activity?.status === 'active' ? 'Activity discontinued' : 'Activity reactivated',
        { variant: activity?.status === 'active' ? 'warning' : 'success' },
      );
    },
  });

  if (isLoading || !activity) {
    return (
      <PageShell eyebrow="Admin › Activities" title="Loading…">
        <span />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`Admin › ${activity.programName}`}
      title={activity.name}
      description={activity.description ?? undefined}
      actions={
        <>
          <StatusPill status={activity.status} />
          <Button component={RouterLink} to={`/admin/activities/${id}/edit`} variant="pillOutlined" size="small">
            ✎ Edit
          </Button>
          <Button
            variant="pillOutlined"
            size="small"
            sx={activity.status === 'active' ? { color: 'secondary.dark', borderColor: 'rgba(188,83,40,0.4)' } : undefined}
            onClick={() =>
              activity.status === 'active' ? setDiscontinueOpen(true) : toggleActivity.mutate()
            }
          >
            {activity.status === 'active' ? '✕ Discontinue' : 'Reactivate'}
          </Button>
          <Button component={RouterLink} to={`/admin/activities/${id}/events/new`} variant="pill" size="small">
            + Schedule Session
          </Button>
        </>
      }
    >
      {activity.status === 'discontinued' && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          Discontinued{activity.discontinue_reason ? ` — ${activity.discontinue_reason}` : ''}. Its
          sessions no longer accept enrollment; history is intact.
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 3 }}>
        <Chip label={activity.type} size="small" variant="outlined" />
        {activity.skillRequired && <Chip label={`Skill: ${activity.skillRequired}`} size="small" variant="outlined" />}
        {activity.trainings.map((t) => (
          <Chip
            key={t.id}
            label={`${t.name} required`}
            size="small"
            sx={{ bgcolor: 'rgba(141,184,166,0.18)', color: '#2d6b56', fontWeight: 600 }}
          />
        ))}
      </Box>

      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
        Sessions ({activity.events.length})
      </Typography>

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Date & time</TableCell>
              <TableCell>Location</TableCell>
              <TableCell>Coordinator</TableCell>
              <TableCell align="center">Seats</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {activity.events.map((e) => (
              <TableRow key={e.id} sx={{ opacity: e.status === 'cancelled' ? 0.55 : 1 }}>
                <TableCell>{e.code}</TableCell>
                <TableCell>
                  {fmtDate(e.date)} · {e.start_time.slice(0, 5)} ({e.duration_hours}h)
                </TableCell>
                <TableCell>{e.location ?? '—'}</TableCell>
                <TableCell>{e.coordinator_name}</TableCell>
                <TableCell align="center">
                  {e.enrolled_count}/{e.max_slots}
                  {e.waitlist_count > 0 ? ` (+${e.waitlist_count} waiting)` : ''}
                </TableCell>
                <TableCell>
                  <StatusPill status={e.status} />
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    {e.status === 'draft' && (
                      <Button size="small" variant="pill" sx={{ px: 1.5, py: 0.25 }} onClick={() => publish.mutate(e.id)}>
                        Publish
                      </Button>
                    )}
                    {(e.status === 'draft' || e.status === 'upcoming') && (
                      <>
                        <Button
                          size="small"
                          variant="pillOutlined"
                          sx={{ px: 1.5, py: 0.25 }}
                          component={RouterLink}
                          to={`/admin/events/${e.id}/edit`}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="pillOutlined"
                          sx={{ px: 1.5, py: 0.25, color: 'secondary.dark' }}
                          onClick={() =>
                            setCancelTarget({
                              id: e.id,
                              label: `${e.name ?? activity.name} on ${fmtDate(e.date)} (${e.enrolled_count} enrolled, ${e.waitlist_count} waiting)`,
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {activity.events.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ color: 'text.secondary', py: 3, textAlign: 'center' }}>
                  No sessions scheduled yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>


      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancel this session?"
        message={`${cancelTarget?.label ?? ''} — every enrolled and waitlisted volunteer will be notified by email.`}
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        danger
        onConfirm={() => cancelTarget && cancel.mutate(cancelTarget.id)}
        onCancel={() => setCancelTarget(null)}
      />

      <ConfirmDialog
        open={discontinueOpen}
        title="Discontinue this activity?"
        message="Its sessions stop accepting enrollment. Nothing is cancelled and no one is emailed — cancel sessions individually if volunteers need to know."
        confirmLabel="Discontinue"
        danger
        onConfirm={() => toggleActivity.mutate()}
        onCancel={() => setDiscontinueOpen(false)}
      />
    </PageShell>
  );
}
