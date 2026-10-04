import {
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
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import { useDebouncedValue } from '@/app/use-debounced';
import { useEffect, useState } from 'react';
import { api, asApiError } from '@/api/client';
import { usePrograms } from '@/api/admin';
import {
  CertificateCandidate,
  openCertificate,
  useCertificateCandidates,
} from '@/api/recognition';
import { CertificatePreviewDialog,ConfirmDialog, FilterBar, PageShell, SortableCell, useColumnFilters, useTableSort } from '@/components';
import { tokens } from '@/theme';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** BR-18 console: who has earned what, per program, and what has gone out. */
export function CertificatesAdmin() {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  // Live search: debounced query + previous rows kept while loading.
  const dq = useDebouncedValue(q);
  const { data } = useCertificateCandidates({ q: dq, programId: '', status: 'all' });
  const { data: programs } = usePrograms('', 'all');

  // Column funnels (Round 39): program and issue-state filter client-side
  // over the loaded rows; their option lists are the data's distinct values.
  const cf = useColumnFilters(data, {
    program: (r) => r.programName,
    certificate: (r) => (r.certificate?.issued ? 'Issued' : 'Pending'),
  });
  // Bulk issue is per program: it arms when the Program funnel holds exactly one.
  const selectedProgramName = cf.filterFor('program').selected.length === 1
    ? cf.filterFor('program').selected[0]
    : null;
  const bulkProgramId = selectedProgramName
    ? (programs ?? []).find((p) => p.name === selectedProgramName)?.id ?? ''
    : '';

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['certificates'] });

  const [issuing, setIssuing] = useState<CertificateCandidate | null>(null);
  const [mementoNote, setMementoNote] = useState('');

  const issue = useMutation({
    mutationFn: async (c: CertificateCandidate) =>
      (
        await api.post('/certificates/issue', {
          volunteerId: c.volunteerId,
          programId: c.programId,
          mementoNote: mementoNote.trim() || undefined,
        })
      ).data,
    onSuccess: (cert: { certificateNumber: string }) => {
      refresh();
      setIssuing(null);
      setMementoNote('');
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
      (await api.post<{ issued: number; skipped: number }>('/certificates/issue-bulk', { programId: bulkProgramId })).data,
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

  const { sorted, sort, toggle } = useTableSort(cf.filtered, {
    volunteer: (r) => r.volunteerName,
    program: (r) => r.programName,
    hours: (r) => Number(r.hours),
    certificate: (r) => r.certificate?.certificateNumber ?? null,
  });

  // Pagination (Round 43) — client-side over the filtered rows, controls
  // above the table per the house convention; search/funnel changes go back
  // to page one.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [dq, cf.filtered.length]);
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const pendingInProgram = cf.filtered.filter((c) => !c.certificate?.issued).length;

  return (
    <PageShell
      title="Issue Certificates"
      description="Every volunteer with attended hours, per program. Issuing renders the PDF, stores it, and emails it with the document attached."
      actions={
        bulkProgramId ? (
          <Tooltip title="Issue every pending certificate in the filtered program — each is rendered and emailed">
            <span>
              <Button variant="pill" disabled={pendingInProgram === 0} onClick={() => setBulkOpen(true)}>
                🏆 Issue all pending ({pendingInProgram})
              </Button>
            </span>
          </Tooltip>
        ) : undefined
      }
    >
      {/* Program and issue-state filters live in the column funnels (Round 39);
          filter to exactly one program to arm the bulk-issue button. */}
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search volunteer, email or program…' }}
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
              <SortableCell sortKey="volunteer" sort={sort} onSort={toggle}>Volunteer</SortableCell>
              <SortableCell sortKey="program" sort={sort} onSort={toggle} filter={cf.filterFor('program')}>Program</SortableCell>
              <SortableCell sortKey="hours" sort={sort} onSort={toggle} align="center">Participation</SortableCell>
              <SortableCell sortKey="certificate" sort={sort} onSort={toggle} filter={cf.filterFor('certificate')}>Certificate</SortableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((c) => (
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
                      <Tooltip title="Download the certificate PDF">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                          onClick={() => void openCertificate(c.certificate!.id)}>
                          ⬇ PDF
                        </Button>
                      </Tooltip>
                      <Tooltip title="View the certificate here without downloading it">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                          onClick={() => setPreviewId(c.certificate!.id)}>
                          👁 Preview
                        </Button>
                      </Tooltip>
                      <Tooltip title="Email the existing certificate PDF to the volunteer again">
                        <Button size="small" variant="pillOutlined" sx={{ px: 1.25, py: 0.3, mr: 0.5 }}
                          disabled={resend.isPending}
                          onClick={() => resend.mutate(c.certificate!.id)}>
                          ✉ Resend
                        </Button>
                      </Tooltip>
                      {c.certificate.stale && (
                        <Tooltip title="Hours changed since issue — recompute, re-render the PDF and email it again">
                          <Button size="small" variant="pill" sx={{ px: 1.25, py: 0.3 }}
                            disabled={reissue.isPending}
                            onClick={() => reissue.mutate(c.certificate!.id)}>
                            ↻ Reissue
                          </Button>
                        </Tooltip>
                      )}
                    </>
                  ) : (
                    <Tooltip title="Issue the certificate — renders the PDF, stores it, and emails it to the volunteer">
                      <Button size="small" variant="pill" sx={{ px: 1.5, py: 0.4 }}
                        disabled={issue.isPending}
                        onClick={() => setIssuing(c)}>
                        🏆 Issue
                      </Button>
                    </Tooltip>
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

      <Dialog open={issuing !== null} onClose={() => setIssuing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Issue certificate</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <Typography sx={{ fontSize: '0.9rem' }}>
            {issuing?.volunteerName} — {issuing?.programName}: the PDF is generated from attended
            hours and emailed immediately.
          </Typography>
          <TextField
            label="Tangible gift note (optional)"
            placeholder="e.g. sapling, memento box"
            helperText="Recorded on the certificate row and mentioned in the email; the handover itself stays offline."
            value={mementoNote}
            onChange={(e) => setMementoNote(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="pillOutlined" onClick={() => setIssuing(null)}>
            Cancel
          </Button>
          <Button
            variant="pill"
            disabled={issue.isPending}
            onClick={() => issuing && issue.mutate(issuing)}
          >
            🏆 Issue
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={bulkOpen}
        title={`Issue all pending certificates — ${selectedProgramName ?? ''}`}
        message={`This issues ${pendingInProgram} certificate(s) for ${selectedProgramName ?? 'this program'}, each rendered and emailed with the PDF attached. Continue?`}
        confirmLabel={bulk.isPending ? 'Issuing…' : 'Issue all'}
        onConfirm={() => bulk.mutate()}
        onCancel={() => setBulkOpen(false)}
      />
      <CertificatePreviewDialog certificateId={previewId} onClose={() => setPreviewId(null)} />
    </PageShell>
  );
}
