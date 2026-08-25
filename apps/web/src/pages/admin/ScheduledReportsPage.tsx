import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { ScheduledReportRow, useScheduledReports } from '@/api/analytics';
import { api, asApiError } from '@/api/client';
import { ConfirmDialog, EmptyState, PageShell, SortableCell, useTableSort } from '@/components';
import { tokens } from '@/theme';

interface FormState {
  id?: string;
  name: string;
  reportType: string;
  format: string;
  frequency: string;
  sendTime: string;
  recipients: string;
}

const EMPTY: FormState = {
  name: '',
  reportType: 'volunteers',
  format: 'Excel',
  frequency: 'Weekly',
  sendTime: '08:00',
  recipients: '',
};

function fmtNext(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Automated reports: schedule CRUD with pause/resume, run-now and next-run display. */
export function ScheduledReportsPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<ScheduledReportRow | null>(null);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data } = useScheduledReports();
  const { sorted, sort, toggle: sortBy } = useTableSort(data, {
    name: (r) => r.name,
    cadence: (r) => `${r.frequency} ${r.sendTime}`,
    recipients: (r) => r.recipients,
    nextRun: (r) => r.nextRunAt,
    status: (r) => r.isActive,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['scheduled-reports'] });
  const fail = (err: unknown) =>
    enqueueSnackbar(asApiError(err)?.message ?? 'Request failed', { variant: 'error' });

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const body = {
        name: f.name,
        reportType: f.reportType,
        format: f.format,
        frequency: f.frequency,
        sendTime: f.sendTime,
        recipients: f.recipients,
      };
      return f.id
        ? (await api.patch(`/reports/scheduled/${f.id}`, body)).data
        : (await api.post('/reports/scheduled', body)).data;
    },
    onSuccess: () => {
      refresh();
      setForm(null);
      enqueueSnackbar('Schedule saved', { variant: 'success' });
    },
    onError: fail,
  });

  const toggle = useMutation({
    mutationFn: async (row: ScheduledReportRow) =>
      (await api.patch(`/reports/scheduled/${row.id}`, { isActive: !row.isActive })).data,
    onSuccess: (updated: ScheduledReportRow) => {
      refresh();
      enqueueSnackbar(
        updated.isActive ? `Resumed — next run ${fmtNext(updated.nextRunAt)}` : 'Paused',
        { variant: 'success' },
      );
    },
    onError: fail,
  });

  const runNow = useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ recipients: number }>(`/reports/scheduled/${id}/run-now`)).data,
    onSuccess: (result) => {
      refresh();
      enqueueSnackbar(`Fired — emailed to ${result.recipients} recipient(s)`, { variant: 'success' });
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/reports/scheduled/${id}`)).data,
    onSuccess: () => {
      refresh();
      setDeleting(null);
      enqueueSnackbar('Schedule deleted', { variant: 'success' });
    },
    onError: fail,
  });

  return (
    <PageShell
      title="Automated Reports"
      description="Each schedule generates its report and emails it as an attachment — daily, weekly or monthly at the chosen time (IST). Pausing freezes the clock; resuming recomputes the next run."
      actions={
        <Button variant="pill" onClick={() => setForm(EMPTY)}>
          + New schedule
        </Button>
      }
    >
      {data?.length === 0 && (
        <EmptyState
          message="No automated reports yet."
          action={<Button variant="pill" onClick={() => setForm(EMPTY)}>Create the first one</Button>}
        />
      )}

      {(data ?? []).length > 0 && (
        <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortableCell sortKey="name" sort={sort} onSort={sortBy}>Schedule</SortableCell>
                <SortableCell sortKey="cadence" sort={sort} onSort={sortBy}>Cadence</SortableCell>
                <SortableCell sortKey="recipients" sort={sort} onSort={sortBy}>Recipients</SortableCell>
                <SortableCell sortKey="nextRun" sort={sort} onSort={sortBy}>Next run</SortableCell>
                <SortableCell sortKey="status" sort={sort} onSort={sortBy}>Status</SortableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{row.name}</Typography>
                    <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                      {row.reportType} · {row.format}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                    {row.frequency} at {row.sendTime.slice(0, 5)}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', maxWidth: 220 }}>
                    {row.recipients.split(',').map((r) => r.trim()).join(', ')}
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                    {row.isActive ? fmtNext(row.nextRunAt) : '—'}
                    {row.lastRunAt && (
                      <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                        last: {fmtNext(row.lastRunAt)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        px: 1.25,
                        py: 0.4,
                        borderRadius: 999,
                        bgcolor: row.isActive ? 'rgba(30,127,79,0.12)' : 'rgba(31,43,54,0.08)',
                        color: row.isActive ? tokens.success : 'text.secondary',
                      }}
                    >
                      {row.isActive ? '● Active' : '⏸ Paused'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                      disabled={runNow.isPending}
                      onClick={() => runNow.mutate(row.id)}>
                      ▶ Run now
                    </Button>
                    <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                      onClick={() => toggle.mutate(row)}>
                      {row.isActive ? '⏸ Pause' : '▶ Resume'}
                    </Button>
                    <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                      onClick={() =>
                        setForm({
                          id: row.id,
                          name: row.name,
                          reportType: row.reportType,
                          format: row.format,
                          frequency: row.frequency,
                          sendTime: row.sendTime.slice(0, 5),
                          recipients: row.recipients,
                        })
                      }>
                      ✎ Edit
                    </Button>
                    <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, color: tokens.accentStrong }}
                      onClick={() => setDeleting(row)}>
                      🗑
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Create / edit dialog */}
      <Dialog open={form !== null} onClose={() => setForm(null)} PaperProps={{ sx: { borderRadius: 4, width: 520, maxWidth: '100%' } }}>
        <DialogTitle sx={{ fontFamily: '"Source Serif 4", Georgia, serif' }}>
          {form?.id ? 'Edit schedule' : 'New automated report'}
        </DialogTitle>
        {form && (
          <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Weekly volunteer summary for funders"
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <TextField select label="Report" value={form.reportType}
                onChange={(e) => setForm({ ...form, reportType: e.target.value })}>
                <MenuItem value="volunteers">Volunteer summary</MenuItem>
                <MenuItem value="programs">Programme summary</MenuItem>
              </TextField>
              <TextField select label="Format" value={form.format}
                onChange={(e) => setForm({ ...form, format: e.target.value })}>
                {['Excel', 'PDF', 'CSV'].map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </TextField>
              <TextField select label="Frequency" value={form.frequency}
                onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {['Daily', 'Weekly', 'Monthly'].map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
              </TextField>
              <TextField
                label="Send time (IST)"
                type="time"
                InputLabelProps={{ shrink: true }}
                value={form.sendTime}
                onChange={(e) => setForm({ ...form, sendTime: e.target.value })}
              />
            </Box>
            <TextField
              label="Recipients"
              helperText="Comma-separated email addresses"
              value={form.recipients}
              onChange={(e) => setForm({ ...form, recipients: e.target.value })}
              placeholder="funders@parinaam.org, director@parinaam.org"
            />
          </DialogContent>
        )}
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setForm(null)}>Cancel</Button>
          <Button
            variant="pill"
            disabled={!form?.name || !form?.recipients || save.isPending}
            onClick={() => form && save.mutate(form)}
          >
            {save.isPending ? 'Saving…' : 'Save schedule'}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title="Delete schedule"
        message={`Delete "${deleting?.name}"? Its run history is kept, but no further reports will be sent.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </PageShell>
  );
}
