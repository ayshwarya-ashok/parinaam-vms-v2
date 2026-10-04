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
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { api, asApiError } from '@/api/client';
import { FilterBar, PageShell, SortableCell, StatusPill, useColumnFilters, useTableSort } from '@/components';
import { useDebouncedValue } from '@/app/use-debounced';
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
  activity: { id: string; name: string };
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
  // Day + month only — the year is on the Date column, and the badge column
  // must stay narrow enough for the table to fit a laptop screen.
  const compact = state.sentAt
    ? new Date(state.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
    : '';
  return (
    <Typography sx={{ fontSize: '0.8rem', color: tokens.success, fontWeight: 600 }}>
      ✓ Sent{compact ? ` ${compact}` : ''}
      {state.count > 1 ? ` (×${state.count})` : ''}
    </Typography>
  );
}

export function FieldExecution() {
  const [q, setQ] = useState('');
  // Live search: debounced query + previous rows kept while loading.
  const dq = useDebouncedValue(q);
  const [modal, setModal] = useState<{ row: DispatchRow; volunteer: Preview; coordinator: Preview } | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data } = useQuery({
    queryKey: ['dispatches', dq],
    queryFn: async () =>
      (
        await api.get<{ data: DispatchRow[] }>('/attendance/dispatches', {
          params: { q: dq || undefined },
        })
      ).data.data,
    placeholderData: (prev) => prev,
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

  // Per-column funnels (Round 39): the distinct lists come straight from the
  // rows on screen, so they can never drift from the data.
  const cf = useColumnFilters(data, {
    program: (r) => r.program.name,
    activity: (r) => r.activity.name,
    volunteerEmail: (r) => (r.volunteerEmail.sent ? 'Sent' : 'Not sent'),
    coordinatorEmail: (r) => (r.coordinatorEmail.sent ? 'Sent' : 'Not sent'),
    report: (r) => (r.reportSubmitted ? 'Submitted' : 'Not submitted'),
  });

  const { sorted, sort, toggle } = useTableSort(cf.filtered, {
    program: (r) => r.program.name,
    activity: (r) => r.activity.name,
    session: (r) => r.name,
    date: (r) => `${String(r.date).slice(0, 10)} ${r.startTime}`,
    volunteerEmail: (r) => r.volunteerEmail.sent,
    coordinatorEmail: (r) => r.coordinatorEmail.sent,
    attendance: (r) => (r.enrolled === 0 ? -1 : r.attended / r.enrolled),
    report: (r) => r.reportSubmitted,
  });

  // Pagination (Round 43) — above the table per the house convention.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [dq, cf.filtered.length]);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <PageShell
      title="Field Execution & Attendance"
      description="Send attendance links per session — one email lets volunteers self-report, the other lets the coordinator file the occurrence report. Open any session's record to see what was logged and correct it."
    >
      {/* Column funnels carry the program/activity/email filters now — the
          bar keeps only the free-text search. */}
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search session, activity or program…' }}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Box>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="program" sort={sort} onSort={toggle} filter={cf.filterFor('program')}>Program</SortableCell>
              <SortableCell sortKey="activity" sort={sort} onSort={toggle} filter={cf.filterFor('activity')}>Activity</SortableCell>
              <SortableCell sortKey="session" sort={sort} onSort={toggle}>Session</SortableCell>
              <SortableCell sortKey="date" sort={sort} onSort={toggle}>Date & time</SortableCell>
              <SortableCell sortKey="volunteerEmail" sort={sort} onSort={toggle} filter={cf.filterFor('volunteerEmail')}>Volunteer email</SortableCell>
              <SortableCell sortKey="coordinatorEmail" sort={sort} onSort={toggle} filter={cf.filterFor('coordinatorEmail')}>Coordinator email</SortableCell>
              <SortableCell sortKey="attendance" sort={sort} onSort={toggle}>Attendance</SortableCell>
              <SortableCell sortKey="report" sort={sort} onSort={toggle} filter={cf.filterFor('report')}>Report</SortableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ fontSize: '0.85rem' }}>{row.program.name}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{row.activity.name}</TableCell>
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
                    {row.coordinator.name}
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
                <TableCell>
                  {row.attended}/{row.enrolled}
                  {row.submitted > row.attended ? ` (${row.submitted} responded)` : ''}
                </TableCell>
                <TableCell>
                  {row.reportSubmitted ? (
                    <Typography sx={{ color: tokens.success, fontWeight: 700, fontSize: '0.85rem' }}>✓</Typography>
                  ) : (
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>—</Typography>
                  )}
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title="Open this session's record — roster, attendance, phases, corrections">
                    <Button
                      size="small"
                      variant="pillOutlined"
                      sx={{ px: 1.25, py: 0.25, mr: 0.5, fontSize: '0.72rem' }}
                      component={RouterLink}
                      to={`/admin/sessions/${row.id}`}
                    >
                      Record ↗
                    </Button>
                  </Tooltip>
                  <Tooltip
                    title={
                      row.volunteerEmail.sent && row.coordinatorEmail.sent
                        ? 'Preview and resend the attendance links to volunteers and/or the coordinator'
                        : 'Preview and send the attendance links — one email per volunteer, one report link for the coordinator'
                    }
                  >
                    <Button
                      size="small"
                      variant={row.volunteerEmail.sent && row.coordinatorEmail.sent ? 'pillOutlined' : 'pill'}
                      sx={{ px: 1.25, py: 0.25, fontSize: '0.72rem' }}
                      onClick={() => openModal.mutate(row)}
                    >
                      {row.volunteerEmail.sent && row.coordinatorEmail.sent ? '↻ Resend' : '✉ Send emails'}
                    </Button>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {cf.filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} sx={{ textAlign: 'left', py: 4, color: 'text.secondary' }}>
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
