import {
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
import { api, asApiError } from '@/api/client';
import { usePrograms } from '@/api/admin';
import {
  CertificateCandidate,
  openCertificate,
  useCertificateCandidates,
} from '@/api/recognition';
import { ConfirmDialog, FilterBar, PageShell } from '@/components';
import { tokens } from '@/theme';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** BR-18 console: who has earned what, per programme, and what has gone out. */
export function CertificatesAdmin() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [programId, setProgramId] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data } = useCertificateCandidates({ q, programId, status });
  const { data: programs } = usePrograms('', 'all');

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['certificates'] });

  const issue = useMutation({
    mutationFn: async (c: CertificateCandidate) =>
      (await api.post('/certificates/issue', { volunteerId: c.volunteerId, programId: c.programId })).data,
    onSuccess: (cert: { certificateNumber: string }) => {
      refresh();
      enqueueSnackbar(`Issued ${cert.certificateNumber} — PDF emailed`, { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Issue failed', { variant: 'error' }),
  });

  const resend = useMutation({
    mutationFn: async (certId: string) => (await api.post(`/certificates/${certId}/resend`)).data,
    onSuccess: () => {
      refresh();
      enqueueSnackbar('Certificate re-emailed', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Resend failed', { variant: 'error' }),
  });

  const reissue = useMutation({
    mutationFn: async (certId: string) => (await api.post(`/certificates/${certId}/reissue`)).data,
    onSuccess: () => {
      refresh();
      enqueueSnackbar('Recomputed, re-rendered and re-emailed', { variant: 'success' });
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Reissue failed', { variant: 'error' }),
  });

  const bulk = useMutation({
    mutationFn: async () =>
      (await api.post<{ issued: number; skipped: number }>('/certificates/issue-bulk', { programId })).data,
    onSuccess: (result) => {
      refresh();
      setBulkOpen(false);
      enqueueSnackbar(
        `Bulk issue: ${result.issued} issued${result.skipped ? `, ${result.skipped} failed` : ''}`,
        { variant: result.skipped ? 'warning' : 'success' },
      );
    },
    onError: (err) => enqueueSnackbar(asApiError(err)?.message ?? 'Bulk issue failed', { variant: 'error' }),
  });

  const pendingInProgram = (data ?? []).filter((c) => !c.certificate?.issued).length;
  const programName = programs?.find((p) => p.id === programId)?.name;

  return (
    <PageShell
      eyebrow="Admin › Recognition"
      title="Issue Certificates"
      description="Every volunteer with attended hours, per programme. Issuing renders the PDF, stores it, and emails it with the document attached."
      actions={
        programId ? (
          <Button variant="pill" disabled={pendingInProgram === 0} onClick={() => setBulkOpen(true)}>
            🏆 Issue all pending ({pendingInProgram})
          </Button>
        ) : undefined
      }
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search volunteer, email or programme…' }}
        groups={[
          {
            label: 'Status',
            value: status,
            onChange: setStatus,
            options: [
              { value: 'all', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'issued', label: 'Issued' },
            ],
          },
          {
            label: 'Programme',
            value: programId || 'all',
            onChange: (v) => setProgramId(v === 'all' ? '' : v),
            options: [
              { value: 'all', label: 'All programmes' },
              ...(programs ?? []).map((p) => ({ value: p.id, label: p.name })),
            ],
          },
        ]}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Volunteer</TableCell>
              <TableCell>Programme</TableCell>
              <TableCell align="center">Participation</TableCell>
              <TableCell>Certificate</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(data ?? []).map((c) => (
              <TableRow key={`${c.volunteerId}-${c.programId}`}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {c.volunteerName}
                    {c.category === 'CSR' && (
                      <Chip label="CSR" size="small" sx={{ ml: 0.75, height: 18, fontSize: '0.68rem' }} />
                    )}
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                    {c.organizationName ?? c.email}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: '0.88rem' }}>{c.programName}</TableCell>
                <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                  <strong>{Number(c.hours)}h</strong> · {c.eventsAttended} session(s)
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {fmtDate(c.periodStart)}
                    {c.periodEnd && c.periodEnd !== c.periodStart ? ` – ${fmtDate(c.periodEnd)}` : ''}
                  </Typography>
                </TableCell>
                <TableCell>
                  {c.certificate?.issued ? (
                    <>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: tokens.success }}>
                        ✓ {c.certificate.certificateNumber}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {fmtDate(c.certificate.issuedAt)}
                        {c.certificate.resendCount > 0 ? ` · resent ×${c.certificate.resendCount}` : ''}
                        {c.certificate.stale && (
                          <Box component="span" sx={{ color: tokens.accentStrong, fontWeight: 700 }}>
                            {' '}· hours changed since issue
                          </Box>
                        )}
                      </Typography>
                    </>
                  ) : (
                    <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>Not issued</Typography>
                  )}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  {c.certificate?.issued ? (
                    <>
                      <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                        onClick={() => void openCertificate(c.certificate!.id)}>
                        ⬇ PDF
                      </Button>
                      <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(c.certificate!.id)}>
                        ✉ Resend
                      </Button>
                      {c.certificate.stale && (
                        <Button size="small" variant="pill" sx={{ px: 1.25, py: 0.3 }}
                          disabled={reissue.isPending}
                          onClick={() => reissue.mutate(c.certificate!.id)}>
                          ↻ Reissue
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button size="small" variant="pill" sx={{ px: 1.5, py: 0.4 }}
                      disabled={issue.isPending}
                      onClick={() => issue.mutate(c)}>
                      🏆 Issue
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No candidates match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ConfirmDialog
        open={bulkOpen}
        title={`Issue all pending certificates — ${programName ?? ''}`}
        message={`This issues ${pendingInProgram} certificate(s) for ${programName ?? 'this programme'}, each rendered and emailed with the PDF attached. Continue?`}
        confirmLabel={bulk.isPending ? 'Issuing…' : 'Issue all'}
        onConfirm={() => bulk.mutate()}
        onCancel={() => setBulkOpen(false)}
      />
    </PageShell>
  );
}
