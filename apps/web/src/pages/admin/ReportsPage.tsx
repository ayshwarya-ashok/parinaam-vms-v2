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
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  exportAndDownload,
  useReportRuns,
  useVolunteerReport,
} from '@/api/analytics';
import { asApiError } from '@/api/client';
import { FilterBar, PageShell, SortableCell, useTableSort } from '@/components';
import { tokens } from '@/theme';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Reports screen: the volunteer table with attendance bars, three export buttons, run history. */
export function ReportsPage() {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('all');
  const [phase, setPhase] = useState('all');
  const [exporting, setExporting] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  const filters = { q, category, phase };
  const { data: rows } = useVolunteerReport(filters);
  const { data: runs, refetch: refetchRuns } = useReportRuns();

  const volunteers = useTableSort(rows, {
    volunteer: (r) => r.volunteer_name,
    category: (r) => `${r.category} ${r.phase}`,
    programmes: (r) => r.programs_joined,
    hours: (r) => Number(r.total_hours),
    attendance: (r) => Number(r.attendance_pct),
    trainings: (r) => r.trainings_passed,
    certificates: (r) => r.certificates_issued,
  });
  const runsSort = useTableSort(runs, {
    when: (r) => r.createdAt,
    report: (r) => r.reportType,
    format: (r) => r.format,
    rowCount: (r) => r.rowCount,
    status: (r) => r.status,
    source: (r) => Boolean(r.scheduledReportId),
  });

  const doExport = async (format: 'CSV' | 'Excel' | 'PDF') => {
    setExporting(format);
    try {
      await exportAndDownload('volunteers', format, {
        q: q || undefined,
        category: category === 'all' ? undefined : category,
        phase: phase === 'all' ? undefined : phase,
      });
      void refetchRuns();
      enqueueSnackbar(`${format} export downloaded`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(asApiError(err)?.message ?? `${format} export failed`, { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <PageShell
      title="Reports"
      description="The volunteer summary — programmes, sessions, hours, attendance, trainings and certificates per person. All three exports contain exactly the rows below."
      actions={
        <>
          {(['CSV', 'Excel', 'PDF'] as const).map((format) => (
            <Button
              key={format}
              variant="pillOutlined"
              disabled={exporting !== null}
              onClick={() => void doExport(format)}
            >
              {exporting === format ? 'Exporting…' : `⬇ ${format}`}
            </Button>
          ))}
          <Button variant="pill" component={RouterLink} to="/admin/reports/scheduled">
            🕐 Automated reports
          </Button>
        </>
      }
    >
      <FilterBar
        search={{ value: q, onChange: setQ, placeholder: 'Search name or email…' }}
        groups={[
          {
            label: 'Category',
            value: category,
            onChange: setCategory,
            options: [
              { value: 'all', label: 'All' },
              { value: 'Individual', label: 'Individual' },
              { value: 'CSR', label: 'CSR' },
            ],
          },
          {
            label: 'Phase',
            value: phase,
            onChange: setPhase,
            options: [
              { value: 'all', label: 'All' },
              { value: 'Onboarding', label: 'Onboarding' },
              { value: 'In Training', label: 'In Training' },
              { value: 'Active', label: 'Active' },
              { value: 'Inactive', label: 'Inactive' },
            ],
          },
        ]}
      />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="volunteer" sort={volunteers.sort} onSort={volunteers.toggle}>Volunteer</SortableCell>
              <SortableCell sortKey="category" sort={volunteers.sort} onSort={volunteers.toggle}>Category / phase</SortableCell>
              <SortableCell sortKey="programmes" sort={volunteers.sort} onSort={volunteers.toggle} align="right">Programmes</SortableCell>
              <SortableCell sortKey="hours" sort={volunteers.sort} onSort={volunteers.toggle} align="right">Hours</SortableCell>
              <SortableCell sortKey="attendance" sort={volunteers.sort} onSort={volunteers.toggle} sx={{ minWidth: 140 }}>Attendance</SortableCell>
              <SortableCell sortKey="trainings" sort={volunteers.sort} onSort={volunteers.toggle} align="right">Trainings</SortableCell>
              <SortableCell sortKey="certificates" sort={volunteers.sort} onSort={volunteers.toggle} align="right">Certificates</SortableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {volunteers.sorted.map((row) => (
              <TableRow key={row.email}>
                <TableCell>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{row.volunteer_name}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                    {row.email}{row.location ? ` · ${row.location}` : ''}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{row.category} · {row.phase}</TableCell>
                <TableCell align="right">{row.programs_joined}</TableCell>
                <TableCell align="right"><strong>{Number(row.total_hours)}</strong></TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: 7, borderRadius: 999, bgcolor: 'rgba(19,35,37,0.08)' }}>
                      <Box
                        sx={{
                          height: 7,
                          borderRadius: 999,
                          width: `${Math.min(100, Number(row.attendance_pct))}%`,
                          bgcolor: Number(row.attendance_pct) >= 75 ? tokens.mint : tokens.accent,
                        }}
                      />
                    </Box>
                    <Typography sx={{ fontSize: '0.78rem', minWidth: 34, textAlign: 'right' }}>
                      {Number(row.attendance_pct)}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell align="right">{row.trainings_passed}</TableCell>
                <TableCell align="right">{row.certificates_issued}</TableCell>
              </TableRow>
            ))}
            {rows?.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  No volunteers match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Typography variant="h6" sx={{ mb: 1 }}>Recent exports</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="when" sort={runsSort.sort} onSort={runsSort.toggle}>When</SortableCell>
              <SortableCell sortKey="report" sort={runsSort.sort} onSort={runsSort.toggle}>Report</SortableCell>
              <SortableCell sortKey="format" sort={runsSort.sort} onSort={runsSort.toggle}>Format</SortableCell>
              <SortableCell sortKey="rowCount" sort={runsSort.sort} onSort={runsSort.toggle} align="right">Rows</SortableCell>
              <SortableCell sortKey="status" sort={runsSort.sort} onSort={runsSort.toggle}>Status</SortableCell>
              <SortableCell sortKey="source" sort={runsSort.sort} onSort={runsSort.toggle}>Source</SortableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runsSort.sorted.slice(0, 12).map((run) => (
              <TableRow key={run.id}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDateTime(run.createdAt)}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{run.reportType}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{run.format}</TableCell>
                <TableCell align="right">{run.rowCount ?? '—'}</TableCell>
                <TableCell>
                  <Typography
                    component="span"
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: run.status === 'success' ? tokens.success : run.status === 'failed' ? tokens.accentStrong : 'text.secondary',
                    }}
                  >
                    {run.status === 'success' ? '✓ success' : run.status === 'failed' ? '✕ failed' : run.status}
                  </Typography>
                </TableCell>
                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {run.scheduledReportId ? '🕐 scheduled' : 'manual'}
                </TableCell>
              </TableRow>
            ))}
            {runs?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                  No exports yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </PageShell>
  );
}
