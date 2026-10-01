import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useActivity } from '@/api/admin';
import { useDynamicCrumbs } from '@/app/breadcrumbs';
import { api, asApiError } from '@/api/client';
import { ConfirmDialog, PageShell, SortableCell, StatusPill, useColumnFilters, useTableSort } from '@/components';
import { useAuth } from '@/app/auth';

function fmtDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function ActivityDetail() {
  // Field coordinators see this page read-only — the API enforces the same.
  const readOnly = useAuth().user?.role === 'field_coordinator';

  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: activity, isLoading } = useActivity(id);
  // Local date, not UTC: "has this session's day arrived?" is a wall-clock question.
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const cf = useColumnFilters(activity?.events, {
    status: (e) => e.status,
    coordinator: (e) => e.coordinator_name,
  });
  const { sorted, sort, toggle } = useTableSort(cf.filtered, {
    code: (e) => e.code,
    date: (e) => `${String(e.date).slice(0, 10)} ${e.start_time}`,
    location: (e) => e.location,
    coordinator: (e) => e.coordinator_name,
    seats: (e) => e.enrolled_count,
    status: (e) => e.status,
  });

  // The URL carries no program segment, so the breadcrumb to the parent
  // program is injected from the fetched activity.
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  const refetch = () => {
    void queryClient.invalidateQueries({ queryKey: ['activity', id] });
    void queryClient.invalidateQueries({ queryKey: ['program'] });
  };

  const markCompleted = useMutation({
    mutationFn: async (eventId: string) => (await api.post(`/events/${eventId}/complete`)).data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activity', id] });
      enqueueSnackbar('Session marked completed — it now counts as conducted', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Could not mark completed', { variant: 'error' }),
  });

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

  // Terminal delete: status becomes "deleted" forever — no reactivate,
  // every further mutation refuses; session history stays for reporting.
  const deleteActivity = useMutation({
    mutationFn: async () =>
      (
        await api.delete<{ deleted: true; sessionsCancelled: number }>(`/activities/${id}`, {
          data: { reason: deleteReason.trim() },
        })
      ).data,
    onSuccess: (res) => {
      setDeleteOpen(false);
      refetch();
      enqueueSnackbar(
        `Activity deleted${res.sessionsCancelled > 0 ? ` — ${res.sessionsCancelled} scheduled session(s) cancelled` : ''}`,
        { variant: 'warning' },
      );
    },
    onError: (err) =>
      enqueueSnackbar(asApiError(err)?.message ?? 'Could not delete the activity', { variant: 'error' }),
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
      <PageShell title="Loading…">
        <span />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={activity.name}
      description={activity.description ?? undefined}
      actions={
        <>
          <StatusPill status={activity.status} />
          {!readOnly && activity.status !== 'deleted' && (<>
          <Button component={RouterLink} to={`/admin/activities/${id}/edit`} variant="pillOutlined" size="small">
            ✏️ Edit
          </Button>
          <Button
            variant="pillOutlined"
            size="small"
            sx={activity.status === 'active' ? { color: 'secondary.dark', borderColor: 'rgba(27,110,160,0.4)' } : undefined}
            onClick={() =>
              activity.status === 'active' ? setDiscontinueOpen(true) : toggleActivity.mutate()
            }
          >
            {activity.status === 'active' ? '✕ Discontinue' : 'Reactivate'}
          </Button>
          <Button component={RouterLink} to={`/admin/activities/${id}/events/new`} variant="pill" size="small">
            + Schedule Session
          </Button>
          <Button
            variant="pillOutlined"
            size="small"
            sx={{ color: '#8B1A1A', borderColor: 'rgba(139,26,26,0.4)' }}
            onClick={() => { setDeleteConfirmName(''); setDeleteReason(''); setDeleteOpen(true); }}
          >
            🗑 Delete
          </Button>
          </>)}
        </>
      }
    >
      {activity.status === 'discontinued' && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          Discontinued{activity.discontinue_reason ? ` — ${activity.discontinue_reason}` : ''}. Its
          sessions no longer accept enrollment; history is intact.
        </Alert>
      )}

      {activity.status === 'deleted' && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          Deleted{(activity as { deleteReason?: string | null }).deleteReason ? ` — ${(activity as { deleteReason?: string | null }).deleteReason}` : ''}.
          This is permanent: the activity cannot be changed or reactivated, and its sessions no
          longer accept enrollment. Recorded history stays in reports.
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
            sx={{ bgcolor: 'rgba(10,170,186,0.18)', color: '#2d6b56', fontWeight: 600 }}
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
              <SortableCell sortKey="code" sort={sort} onSort={toggle}>Code</SortableCell>
              <SortableCell sortKey="date" sort={sort} onSort={toggle}>Date & time</SortableCell>
              <SortableCell sortKey="location" sort={sort} onSort={toggle}>Location</SortableCell>
              <SortableCell sortKey="coordinator" sort={sort} onSort={toggle} filter={cf.filterFor('coordinator')}>Coordinator</SortableCell>
              <SortableCell sortKey="seats" sort={sort} onSort={toggle} align="center">Seats</SortableCell>
              <SortableCell sortKey="status" sort={sort} onSort={toggle} filter={cf.filterFor('status')}>Status</SortableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((e) => (
              <TableRow key={e.id} sx={{ opacity: e.status === 'cancelled' ? 0.55 : 1 }}>
                <TableCell>
                  <Typography
                    component={RouterLink}
                    to={`/admin/sessions/${e.id}`}
                    sx={{
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'inherit',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {e.code}
                  </Typography>
                </TableCell>
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
                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.25 }}>
                    {e.phase_total > 0
                      ? `${e.phases_completed}/${e.phase_total} phases`
                      : e.status === 'draft'
                        ? 'staff only'
                        : e.status === 'upcoming'
                          ? 'open to volunteers'
                          : e.status === 'completed'
                            ? 'hours logged'
                            : ''}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.5, py: 0.25 }}
                      component={RouterLink}
                      to={`/admin/sessions/${e.id}`}
                    >
                      {e.status === 'completed' ? 'Attendance' : 'Roster'}
                    </Button>
                    {!readOnly && e.status === 'draft' && (
                      <Tooltip title="Makes the session visible to volunteers and open for enrolment. Until then it is a draft only staff can see.">
                        <Button size="small" variant="pill" sx={{ px: 1.5, py: 0.25 }} onClick={() => publish.mutate(e.id)}>
                          Publish
                        </Button>
                      </Tooltip>
                    )}
                    {!readOnly && e.status === 'upcoming' && e.phase_total === 0 && String(e.date).slice(0, 10) <= todayIso && (
                      <Button
                        size="small"
                        variant="pill"
                        sx={{ px: 1.5, py: 0.25 }}
                        disabled={markCompleted.isPending}
                        onClick={() => markCompleted.mutate(e.id)}
                      >
                        ✓ Mark completed
                      </Button>
                    )}
                    {!readOnly && (e.status === 'draft' || e.status === 'upcoming' || e.status === 'inprogress') && (
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

      {/* Delete modal — hard-delete contract: type the name, give a reason */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 500 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Delete this activity?
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            This is a <strong>hard delete and cannot be reversed</strong>. {activity.name} becomes
            permanently <strong>Deleted</strong>, its not-yet-completed sessions are{' '}
            <strong>cancelled</strong> (volunteers are not emailed), and no new sessions can be
            scheduled under it. Completed history (sessions, hours, certificates) stays in reports.
          </Alert>
          <TextField
            label={`Type "${activity.name}" to confirm`}
            fullWidth
            autoFocus
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
          />
          <TextField
            label="Reason for deletion (required)"
            fullWidth
            multiline
            minRows={2}
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="pill"
            sx={{ background: 'linear-gradient(135deg,#9a2020,#7a1616)' }}
            disabled={
              deleteActivity.isPending ||
              deleteConfirmName.trim() !== activity.name ||
              deleteReason.trim().length === 0
            }
            onClick={() => deleteActivity.mutate()}
          >
            {deleteActivity.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}
