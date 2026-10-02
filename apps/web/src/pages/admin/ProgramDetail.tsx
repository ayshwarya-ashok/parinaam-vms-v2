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
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useProgram, useProgramAction } from '@/api/admin';
import { api, asApiError } from '@/api/client';
import { PageShell, StatusPill } from '@/components';
import { useAuth } from '@/app/auth';

export function ProgramDetail() {
  // Field coordinators see this page read-only — the API enforces the same.
  const readOnly = useAuth().user?.role === 'field_coordinator';

  const { id } = useParams<{ id: string }>();
  const { enqueueSnackbar } = useSnackbar();

  const { data: program, isLoading } = useProgram(id);
  const action = useProgramAction(id!);

  const [discontinueOpen, setDiscontinueOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; recipientCount: number } | null>(null);

  const queryClient = useQueryClient();

  // Terminal delete: status becomes "deleted" forever — no reactivate, every
  // further mutation refuses. History beneath it (sessions, hours,
  // certificates) is kept for reporting.
  const deleteProgram = useMutation({
    mutationFn: async () =>
      (
        await api.delete<{ deleted: true; sessionsCancelled: number }>(`/programs/${id}`, {
          data: { reason: deleteReason.trim() },
        })
      ).data,
    onSuccess: (res) => {
      setDeleteOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['program', id] });
      void queryClient.invalidateQueries({ queryKey: ['programs'] });
      enqueueSnackbar(
        `Program deleted${res.sessionsCancelled > 0 ? ` — ${res.sessionsCancelled} scheduled session(s) cancelled` : ''}`,
        { variant: 'warning' },
      );
    },
    onError: (err) =>
      enqueueSnackbar(asApiError(err)?.message ?? 'Could not delete the program', { variant: 'error' }),
  });

  const openAnnounce = useMutation({
    mutationFn: async () =>
      (await api.post<{ subject: string; html: string; recipientCount: number }>(
        `/programs/${id}/announcement/preview`,
      )).data,
    onSuccess: (data) => {
      setPreview(data);
      setAnnounceOpen(true);
    },
    onError: (err) =>
      enqueueSnackbar(asApiError(err)?.message ?? 'Could not build the preview', {
        variant: 'error',
      }),
  });

  const send = useMutation({
    mutationFn: async () =>
      (await api.post<{ recipients: number; isResend: boolean }>(`/programs/${id}/announcement`))
        .data,
    onSuccess: (data) => {
      setAnnounceOpen(false);
      enqueueSnackbar(
        `Announcement ${data.isResend ? 'resent' : 'sent'} to ${data.recipients} volunteers`,
        { variant: 'success' },
      );
    },
    onError: (err) =>
      enqueueSnackbar(asApiError(err)?.message ?? 'Send failed', { variant: 'error' }),
  });

  if (isLoading || !program) {
    return (
      <PageShell title="Loading…">
        <span />
      </PageShell>
    );
  }

  const isDiscontinued = program.status === 'discontinued';
  const isDeleted = program.status === 'deleted';

  return (
    <PageShell
      title={program.name}
      description={program.description ?? undefined}
      actions={
        <>
          <StatusPill status={program.status} />
          {!readOnly && !isDeleted && (<>
          <Button component={RouterLink} to={`/admin/programs/${id}/edit`} variant="pillOutlined" size="small">
            ✏️ Edit
          </Button>
          {program.status === 'draft' && (
            <Button
              variant="pill"
              size="small"
              onClick={() =>
                action.mutate('publish', {
                  onSuccess: () => enqueueSnackbar('Program published', { variant: 'success' }),
                })
              }
            >
              Publish
            </Button>
          )}
          {program.status === 'active' && (
            <>
              <Button variant="pillOutlined" size="small" onClick={() => openAnnounce.mutate()}>
                📢 Announce
              </Button>
              <Button
                variant="pillOutlined"
                size="small"
                sx={{ color: 'secondary.dark', borderColor: 'rgba(27,110,160,0.4)' }}
                onClick={() => setDiscontinueOpen(true)}
              >
                ✕ Discontinue
              </Button>
            </>
          )}
          {isDiscontinued && (
            <Button
              variant="pill"
              size="small"
              onClick={() =>
                action.mutate('reactivate', {
                  onSuccess: () => enqueueSnackbar('Program reactivated', { variant: 'success' }),
                })
              }
            >
              Reactivate
            </Button>
          )}
          <Button component={RouterLink} to={`/admin/programs/${id}/activities/new`} variant="pill" size="small">
            + Add Activity
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
      {isDiscontinued && (
        <Alert severity="warning" sx={{ mb: 2, borderRadius: 3 }}>
          Discontinued{program.discontinueReason ? ` — ${program.discontinueReason}` : ''}. New
          enrollment is blocked on every session beneath this program; scheduled sessions were not
          cancelled and no one was emailed.
        </Alert>
      )}

      {isDeleted && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
          Deleted{program.deleteReason ? ` — ${program.deleteReason}` : ''}. This is permanent:
          the program cannot be changed or reactivated, and enrollment is blocked on everything
          beneath it. Its history (sessions, hours, certificates) is retained for reporting.
        </Alert>
      )}

      {/* Program-level trainings */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', mb: 1 }}>
          Program-level trainings (required by every activity)
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          {program.trainings.length === 0 && (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>None linked.</Typography>
          )}
          {program.trainings.map((t) => (
            <Chip
              key={t.id}
              label={`${t.name} · ${t.duration} · ${t.mode}`}
              size="small"
              sx={{ bgcolor: 'rgba(10,170,186,0.18)', color: '#2d6b56', fontWeight: 600 }}
            />
          ))}
        </Box>
      </Box>

      {/* Activities with their occurrences */}
      <Typography sx={{ fontWeight: 700, fontSize: '1.1rem', mb: 1.5 }}>
        Activities ({program.activities.length})
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {program.activities.map((a) => (
          <Paper
            key={a.id}
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.8)',
              opacity: a.status === 'discontinued' || a.status === 'deleted' ? 0.6 : 1,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography
                    component={RouterLink}
                    to={`/admin/activities/${a.id}`}
                    sx={{ fontWeight: 700, textDecoration: 'none', color: 'text.primary', '&:hover': { color: 'secondary.dark' } }}
                  >
                    {a.name}
                  </Typography>
                  <StatusPill status={a.status} />
                  <Chip label={a.type} size="small" variant="outlined" />
                </Box>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.5 }}>
                  {a.skill_required ? `Skill: ${a.skill_required} · ` : ''}
                  defaults: {a.default_duration_hours ?? '—'}h · {a.default_max_slots ?? '—'} slots ·{' '}
                  {a.default_location ?? 'no location'}
                </Typography>
                <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem', mt: 0.25 }}>
                  {a.upcoming_events} upcoming · {a.completed_events} completed session
                  {a.completed_events === 1 ? '' : 's'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', flexShrink: 0 }}>
                <Button component={RouterLink} to={`/admin/activities/${a.id}`} variant="pillOutlined" size="small" sx={{ px: 2, py: 0.5 }}>
                  Sessions
                </Button>
                {/* Nothing new is scheduled under a deleted activity or
                    program — the button goes, not just the endpoint (6b). */}
                {!readOnly && a.status !== 'deleted' && !isDeleted && (
                  <Button
                    component={RouterLink}
                    to={`/admin/activities/${a.id}/events/new`}
                    variant="pill"
                    size="small"
                    sx={{ px: 2, py: 0.5 }}
                  >
                    + Schedule
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
        {program.activities.length === 0 && (
          <Typography sx={{ color: 'text.secondary' }}>
            No activities yet — add the first one to start scheduling sessions.
          </Typography>
        )}
      </Box>


      {/* Discontinue modal — explicit about what it does NOT do */}
      <Dialog open={discontinueOpen} onClose={() => setDiscontinueOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 480 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Discontinue this program?
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            This <strong>blocks new enrollment</strong> on every session under {program.name}. It
            does <strong>not cancel</strong> scheduled sessions and <strong>no one is emailed</strong> —
            cancel sessions individually if volunteers need to be notified.
          </Alert>
          <TextField
            label="Reason (recorded in the audit trail)"
            fullWidth
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setDiscontinueOpen(false)}>
            Keep active
          </Button>
          <Button
            variant="pill"
            sx={{ background: 'linear-gradient(135deg,#c0442a,#9a3620)' }}
            onClick={() =>
              action.mutate(
                { discontinue: reason },
                {
                  onSuccess: (data: { upcomingEventsBlocked: number }) => {
                    setDiscontinueOpen(false);
                    enqueueSnackbar(
                      `Discontinued — ${data.upcomingEventsBlocked} upcoming session(s) no longer accept enrollment`,
                      { variant: 'warning' },
                    );
                  },
                },
              )
            }
          >
            Discontinue
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete modal — hard-delete contract: type the name, give a reason */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 500 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Delete this program?
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            This is a <strong>hard delete and cannot be reversed</strong>. {program.name} and every
            activity under it become permanently <strong>Deleted</strong>, its not-yet-completed
            sessions are <strong>cancelled</strong> (volunteers are not emailed), and nothing new
            can be scheduled beneath it. Completed history (sessions, hours, certificates) stays
            in reports.
          </Alert>
          <TextField
            label={`Type "${program.name}" to confirm`}
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
              deleteProgram.isPending ||
              deleteConfirmName.trim() !== program.name ||
              deleteReason.trim().length === 0
            }
            onClick={() => deleteProgram.mutate()}
          >
            {deleteProgram.isPending ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Announce modal — the preview IS the send */}
      <Dialog open={announceOpen} onClose={() => setAnnounceOpen(false)} PaperProps={{ sx: { borderRadius: 4, maxWidth: 620 } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Announce to volunteers
        </DialogTitle>
        <DialogContent>
          {preview && (
            <>
              <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', mb: 1 }}>
                To: all opted-in volunteers ({preview.recipientCount}) · Subject:{' '}
                <strong>{preview.subject}</strong>
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
                {/* Rendered by the same template the send uses — cannot drift. */}
                <iframe title="preview" srcDoc={preview.html} style={{ width: '100%', height: 400, border: 0 }} />
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setAnnounceOpen(false)}>
            Cancel
          </Button>
          <Button variant="pill" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? 'Sending…' : `📢 Send to ${preview?.recipientCount ?? 0} volunteers`}
          </Button>
        </DialogActions>
      </Dialog>

    </PageShell>
  );
}
