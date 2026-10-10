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
  Tooltip,
  Typography,
} from '@mui/material';
import { useSnackbar } from 'notistack';
import { useDebouncedValue } from '@/app/use-debounced';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  exportAndDownload,
  useReportRuns,
  useVolunteerReport,
} from '@/api/analytics';
import { asApiError } from '@/api/client';
import { FilterBar, PageShell, SortableCell, useColumnFilters, useTableSort } from '@/components';
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
  const [exporting, setExporting] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  // Live search: debounced query + previous rows kept while loading.
  const dq = useDebouncedValue(q);
  const { data: rows } = useVolunteerReport({ q: dq, category: 'all', phase: 'all' });
  const { data: runs, refetch: refetchRuns } = useReportRuns();

  // Column funnels (Round 39): distinct values straight from the rows.
  const cf = useColumnFilters(rows, {
    category: (r) => r.category,
    phase: (r) => r.phase,
  });
  const volunteers = useTableSort(cf.filtered, {
    volunteer: (r) => r.volunteer_name,
    category: (r) => r.category,
    phase: (r) => r.phase,
    programs: (r) => r.programs_joined,
    hours: (r) => Number(r.total_hours),
    attendance: (r) => Number(r.attendance_pct),
    trainings: (r) => r.trainings_passed,
    certificates: (r) => r.certificates_issued,
  });
  const runsCf = useColumnFilters(runs, {
    report: (r) => r.reportType,
    format: (r) => r.format,
    status: (r) => r.status,
    source: (r) => (r.scheduledReportId ? 'scheduled' : 'manual'),
  });
  const runsSort = useTableSort(runsCf.filtered, {
    when: (r) => r.createdAt,
    report: (r) => r.reportType,
    format: (r) => r.format,
    rowCount: (r) => r.rowCount,
    status: (r) => r.status,
    source: (r) => Boolean(r.scheduledReportId),
  });
  // Exports mirror the funnels where the export API can express them (it takes
  // one category/phase); a multi-selection exports the broader set.
  const single = (key: string) => {
    const sel = cf.filterFor(key).selected;
    return sel.length === 1 ? sel[0] : undefined;
  };

  const doCalendarExport = async () => {
    setExporting('Calendar');
    try {
      await exportAndDownload('calendar', 'Excel', { year: new Date().getFullYear() });
      void refetchRuns();
      enqueueSnackbar('Annual calendar downloaded', { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(asApiError(err)?.message ?? 'Calendar export failed', { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  /** The one-click list exports — each is a whole dataset, always as Excel. */
  const LIST_EXPORTS = [
    // Round 58 — the everything-on-one-line export: program → activity →
    // session → participant, with statuses, the activity's default hours, and
    // attendance hours once a session is completed.
    { type: 'consolidated', label: 'Consolidated' },
    { type: 'programs', label: 'Programs' },
    { type: 'activities', label: 'Activities' },
    { type: 'volunteer_directory', label: 'Volunteers' },
    { type: 'volunteer_activities', label: 'Volunteer–activity' },
  ] as const;

  const doListExport = async (type: string, label: string) => {
    setExporting(type);
    try {
      await exportAndDownload(type, 'Excel', {});
      void refetchRuns();
      enqueueSnackbar(`${label} export downloaded`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(asApiError(err)?.message ?? `${label} export failed`, { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  const doExport = async (format: 'CSV' | 'Excel' | 'PDF') => {
    setExporting(format);
    try {
      await exportAndDownload('volunteers', format, {
        q: q || undefined,
        category: single('category'),
        phase: single('phase'),
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
      description="The volunteer summary — programs, sessions, hours, attendance, trainings and certificates per person. All three exports contain exactly the rows below."
      actions={
        <>
          {(['CSV', 'Excel', 'PDF'] as const).map((format) => (
            <Tooltip key={format} title={`Download the volunteer table below as a ${format} file`}>
              <span>
                <Button
                  variant="pillOutlined"
                  disabled={exporting !== null}
                  onClick={() => void doExport(format)}
                >
                  {exporting === format ? 'Exporting…' : `⬇ ${format}`}
                </Button>
              </span>
            </Tooltip>
          ))}
          <Tooltip title="Download this year's full session calendar as an Excel file">
            <span>
              <Button
                variant="pillOutlined"
                disabled={exporting !== null}
                onClick={() => void doCalendarExport()}
              >
                {exporting === 'Calendar' ? 'Exporting…' : `📅 ${new Date().getFullYear()} calendar`}
              </Button>
            </span>
          </Tooltip>
          <Tooltip title="Manage reports that email themselves on a schedule">
            <Button variant="pill" component={RouterLink} to="/admin/reports/scheduled">
              🕐 Automated reports
            </Button>
          </Tooltip>
        </>
      }
    >
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          px: 2,
          mb: 2,
          borderRadius: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          bgcolor: 'rgba(255,255,255,0.6)',
        }}
      >
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mr: 1 }}>
          List exports (Excel)
        </Typography>
        {LIST_EXPORTS.map((x) => (
          <Tooltip key={x.type} title={`Download the complete ${x.label.toLowerCase()} dataset as Excel`}>
            <span>
              <Button
                size="small"
                variant="pillOutlined"
                disabled={exporting !== null}
                onClick={() => void doListExport(x.type, x.label)}
              >
                {exporting === x.type ? 'Exporting…' : `⬇ ${x.label}`}
              </Button>
            </span>
          </Tooltip>
        ))}
      </Paper>

      {/* Category/Phase moved into their column funnels (Round 39). */}
      <FilterBar search={{ value: q, onChange: setQ, placeholder: 'Search name or email…' }} />

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 3 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortableCell sortKey="volunteer" sort={volunteers.sort} onSort={volunteers.toggle}>Volunteer</SortableCell>
              <SortableCell sortKey="category" sort={volunteers.sort} onSort={volunteers.toggle} filter={cf.filterFor('category')}>Category</SortableCell>
              <SortableCell sortKey="phase" sort={volunteers.sort} onSort={volunteers.toggle} filter={cf.filterFor('phase')}>Phase</SortableCell>
              <SortableCell sortKey="programs" sort={volunteers.sort} onSort={volunteers.toggle}>Programs</SortableCell>
              <SortableCell sortKey="hours" sort={volunteers.sort} onSort={volunteers.toggle}>Hours</SortableCell>
              <SortableCell sortKey="attendance" sort={volunteers.sort} onSort={volunteers.toggle} sx={{ minWidth: 140 }}>Attendance</SortableCell>
              <SortableCell sortKey="trainings" sort={volunteers.sort} onSort={volunteers.toggle}>Trainings</SortableCell>
              <SortableCell sortKey="certificates" sort={volunteers.sort} onSort={volunteers.toggle}>Certificates</SortableCell>
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
                <TableCell sx={{ fontSize: '0.85rem' }}>{row.category}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{row.phase}</TableCell>
                <TableCell>{row.programs_joined}</TableCell>
                <TableCell><strong>{Number(row.total_hours)}</strong></TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ flex: 1, height: 7, borderRadius: 999, bgcolor: 'rgba(31,43,54,0.08)' }}>
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
                <TableCell>{row.trainings_passed}</TableCell>
                <TableCell>{row.certificates_issued}</TableCell>
              </TableRow>
            ))}
            {cf.filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} sx={{ textAlign: 'left', py: 4, color: 'text.secondary' }}>
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
              <SortableCell sortKey="report" sort={runsSort.sort} onSort={runsSort.toggle} filter={runsCf.filterFor('report')}>Report</SortableCell>
              <SortableCell sortKey="format" sort={runsSort.sort} onSort={runsSort.toggle} filter={runsCf.filterFor('format')}>Format</SortableCell>
              <SortableCell sortKey="rowCount" sort={runsSort.sort} onSort={runsSort.toggle}>Rows</SortableCell>
              <SortableCell sortKey="status" sort={runsSort.sort} onSort={runsSort.toggle} filter={runsCf.filterFor('status')}>Status</SortableCell>
              <SortableCell sortKey="source" sort={runsSort.sort} onSort={runsSort.toggle} filter={runsCf.filterFor('source')}>Source</SortableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {runsSort.sorted.slice(0, 12).map((run) => (
              <TableRow key={run.id}>
                <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>{fmtDateTime(run.createdAt)}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{run.reportType}</TableCell>
                <TableCell sx={{ fontSize: '0.85rem' }}>{run.format}</TableCell>
                <TableCell>{run.rowCount ?? '—'}</TableCell>
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
            {runsCf.filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'left', py: 3, color: 'text.secondary' }}>
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
