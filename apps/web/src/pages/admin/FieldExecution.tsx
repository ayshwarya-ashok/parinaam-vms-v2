import {
  Box,
  Button,
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
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { FilterBar, PageShell, SortableCell, StatusPill, useTableSort } from '@/components';
import { tokens } from '@/theme';

interface DispatchRow {
  id: string;
  code: string;
  name: string;
  date: string;
  startTime: string;
  location: string | null;
  status: 'upcoming' | 'completed';
  program: { id: string; name: string };
  coordinator: { name: string; email: string };
  volunteerEmail: { sent: boolean; sentAt: string | null; count: number };
  coordinatorEmail: { sent: boolean; sentAt: string | null; count: number };
  enrolled: number;
  submitted: number;
  attended: number;
  reportSubmitted: boolean;
}

interface Preview {
  subject: string;
  html: string;
  recipients: number;
}

function fmtDate(iso: string): string {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function SentBadge({ state }: { state: { sent: boolean; sentAt: string | null; count: number } }) {
  if (!state.sent) {
    return <Typography sx={{ fontSize: '0.8rem', color: tokens.accentStrong }}>● Not sent</Typography>;
  }
  return (
    <Typography sx={{ fontSize: '0.8rem', color: tokens.success, fontWeight: 600 }}>
      ✓ Sent{state.sentAt ? ` ${fmtDate(state.sentAt)}` : ''}
      {state.count > 1 ? ` (×${state.count})` : ''}
    </Typography>
  );
}

export function FieldExecution() {
  const [q, setQ] = useState('');
  const [sendStatus, setSendStatus] = useState('all');
  const [modal, setModal] = useState<{ row: DispatchRow; volunteer: Preview; coordinator: Preview } | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data } = useQuery({
    queryKey: ['dispatches', q, sendStatus],
    queryFn: async () =>
      (
        await api.get<{ data: DispatchRow[] }>('/attendance/dispatches', {
          params: { q: q || undefined, sendStatus: sendStatus === 'all' ? undefined : sendStatus },
        })
      ).data.data,
  });

  const openModal = useMutation({
    mutationFn: async (row: DispatchRow) => {
      const [volunteer, coordinator] = await Promise.all([
        api.post<Preview>(`/attendance/dispatches/${row.id}/preview`, { target: 'volunteer' }),
        api.post<Preview>(`/attendance/dispatches/${row.id}/preview`, { target: 'coordinator' }),
      ]);
      return { row, volunteer: volunteer.data, coordinator: coordinator.data };
    },
    onSuccess: setModal,
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Preview failed', { variant: 'error' }),
  });

  const send = useMutation({
    mutationFn: async (input: { eventId: string; target: 'volunteer' | 'coordinator' | 'both' }) =>
      (
        await api.post<{ volunteersSent: number; coordinatorSent: boolean }>(
          `/attendance/dispatches/${input.eventId}/send`,
          { target: input.target },
        )
      ).data,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      setModal(null);
      const parts = [];
      if (result.volunteersSent > 0) parts.push(`${result.volunteersSent} volunteer link(s)`);
      if (result.coordinatorSent) parts.push('coordinator report link');
      enqueueSnackbar(`Sent: ${parts.join(' + ')}`, { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Send failed', { variant: 'error' }),
  });

  const { sorted, sort, toggle } = useTableSort(data, {
    session: (r) => r.name,
    date: (r) => `${String(r.date).slice(0, 10)} ${r.startTime}`,
    volunteerEmail: (r) => r.volunteerEmail.sent,
    coordinatorEmail: (r) => r.coordinatorEmail.sent,
    attendance: (r) => (r.enrolled === 0 ? -1 : r.attended / r.enrolled),
    report: (r) => r.reportSubmitted,
  });

  return (
    <PageShell
      eyebrow="Admin › Field Execution"
      title="Field Execution & Attendance"
      description="Send attendance links per session — one email lets volunteers self-report, the other lets the coordinator file the occurrence report. Open any session's record to see what was logged and correct it."
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search session or program…' }}
        groups={[
          {
            label: 'Email status',
            value: sendStatus,
            onChange: setSendStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Not sent' },
              { value: 'sent', label: 'Sent' },
            ],
          },
        ]}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="session" sort={sort} onSort={toggle}>Session</SortableCell>
              <SortableCell sortKey="date" sort={sort} onSort={toggle}>Date & time</SortableCell>
              <SortableCell sortKey="volunteerEmail" sort={sort} onSort={toggle}>Volunteer email</SortableCell>
              <SortableCell sortKey="coordinatorEmail" sort={sort} onSort={toggle}>Coordinator email</SortableCell>
              <SortableCell sortKey="attendance" sort={sort} onSort={toggle} align="center">Attendance</SortableCell>
              <SortableCell sortKey="report" sort={sort} onSort={toggle} align="center">Report</SortableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <Typography
                    component={RouterLink}
                    to={`/admin/sessions/${row.id}`}
                    sx={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      color: 'inherit',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    {row.name}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    {row.program.name} · {row.coordinator.name}
                  </Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {fmtDate(row.date)}
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    {row.startTime} · <StatusPill status={row.status} />
                  </Typography>
                </TableCell>
                <TableCell>
                  <SentBadge state={row.volunteerEmail} />
                </TableCell>
                <TableCell>
                  <SentBadge state={row.coordinatorEmail} />
                </TableCell>
                <TableCell align="center">
                  {row.attended}/{row.enrolled}
                  {row.submitted > row.attended ? ` (${row.submitted} responded)` : ''}
                </TableCell>
                <TableCell align="center">
                  {row.reportSubmitted ? (
                    <Typography sx={{ color: tokens.success, fontWeight: 700, fontSize: '0.85rem' }}>✓</Typography>
                  ) : (
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>—</Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 1.5, py: 0.4, mr: 0.5 }}
                    component={RouterLink}
                    to={`/admin/sessions/${row.id}`}
                  >
                    Record ↗
                  </Button>
                  <Button
                    size="small"
                    variant={row.volunteerEmail.sent && row.coordinatorEmail.sent ? 'pillOutlined' : 'pill'}
                    sx={{ px: 1.5, py: 0.4 }}
                    onClick={() => openModal.mutate(row)}
                  >
                    {row.volunteerEmail.sent && row.coordinatorEmail.sent ? '↻ Resend' : '✉ Send emails'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No sessions match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Send modal — both previews rendered by the exact templates the send uses */}
      <Dialog
        open={modal !== null}
        onClose={() => setModal(null)}
        PaperProps={{ sx: { borderRadius: 4, maxWidth: 640, width: '100%' } }}
      >
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          Send attendance emails — {modal?.row.name}
        </DialogTitle>
        <DialogContent>
          {modal && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <PreviewBlock
                title={`👤 Volunteer email — ${modal.volunteer.recipients} recipient(s)`}
                preview={modal.volunteer}
                action={
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 1.5, py: 0.4 }}
                    onClick={() => send.mutate({ eventId: modal.row.id, target: 'volunteer' })}
                  >
                    Send to volunteers
                  </Button>
                }
              />
              <PreviewBlock
                title={`📋 Coordinator email — ${modal.row.coordinator.name}`}
                preview={modal.coordinator}
                action={
                  <Button
                    size="small"
                    variant="pillOutlined"
                    sx={{ px: 1.5, py: 0.4 }}
                    onClick={() => send.mutate({ eventId: modal.row.id, target: 'coordinator' })}
                  >
                    Send to coordinator
                  </Button>
                }
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setModal(null)}>
            Close
          </Button>
          <Button
            variant="pill"
            disabled={send.isPending}
            onClick={() => modal && send.mutate({ eventId: modal.row.id, target: 'both' })}
          >
            {send.isPending ? 'Sending…' : '✉ Send both emails'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageShell>
  );
}

function PreviewBlock({
  title,
  preview,
  action,
}: {
  title: string;
  preview: Preview;
  action: React.ReactNode;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>{title}</Typography>
        {action}
      </Box>
      <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', mb: 0.5 }}>
        Subject: <strong>{preview.subject}</strong>
      </Typography>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <iframe title={title} srcDoc={preview.html} style={{ width: '100%', height: 210, border: 0 }} />
      </Paper>
    </Box>
  );
}
