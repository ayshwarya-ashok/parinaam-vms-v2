import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
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
import { useSnackbar } from 'notistack';
import { useDebouncedValue } from '@/app/use-debounced';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  exportAndDownload,
  useReportPreview,
  useReportRuns,
  useVolunteerReport,
} from '@/api/analytics';
import { alpha } from '@mui/material/styles';
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

/**
 * Round 60 — the redesigned Reports screen: pick a report, scope it with the
 * period control, preview it on screen, export it in any format. The volunteer
 * summary keeps its rich table (bars, funnels); every other report previews
 * through the generic endpoint that renders exactly what the exports contain.
 */
const REPORTS = [
  { type: 'volunteers', label: 'Volunteer summary', period: true },
  { type: 'consolidated', label: 'Consolidated', period: true },
  { type: 'programs', label: 'Programs', period: true },
  { type: 'activities', label: 'Activities', period: true },
  { type: 'volunteer_activities', label: 'Volunteer–activity', period: true },
  { type: 'volunteer_directory', label: 'Volunteer directory', period: false },
  { type: 'calendar', label: 'Annual calendar', period: false },
] as const;
type ReportType = (typeof REPORTS)[number]['type'];
export function ReportsPage() {
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const { enqueueSnackbar } = useSnackbar();

  // Round 60 — which report the whole screen is about.
  const [reportType, setReportType] = useState<ReportType>('volunteers');
  const report = REPORTS.find((r) => r.type === reportType)!;
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // Round 59 — the period control: All covers everything; Custom range scopes
  // the table and every export to sessions (and trainings, feedback,
  // certificates) inside the inclusive from–to window.
  const [period, setPeriod] = useState<'all' | 'custom'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rangeReady =
    !report.period || period === 'all' || (!!from && !!to && from <= to);
  const range: { from?: string; to?: string } =
    report.period && period === 'custom' && !!from && !!to && from <= to ? { from, to } : {};

  // Live search: debounced query + previous rows kept while loading.
  const dq = useDebouncedValue(q);
  const { data: rows } = useVolunteerReport({ q: dq, category: 'all', phase: 'all', ...range });

  // Every non-volunteer report previews through the generic endpoint.
  const preview = useReportPreview(
    reportType,
    { ...range, year: reportType === 'calendar' ? year : undefined },
    reportType !== 'volunteers' && rangeReady,
  );
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

  /** One export path for whatever report is selected, in any format. */
  const doExport = async (format: 'CSV' | 'Excel' | 'PDF') => {
    setExporting(format);
    try {
      const filters: Record<string, unknown> =
        reportType === 'volunteers'
          ? { q: q || undefined, category: single('category'), phase: single('phase'), ...range }
          : reportType === 'calendar'
            ? { year }
            : { ...range };
      await exportAndDownload(reportType, format, filters);
      void refetchRuns();
      enqueueSnackbar(`${report.label} downloaded as ${format}`, { variant: 'success' });
    } catch (err) {
      enqueueSnackbar(asApiError(err)?.message ?? `${format} export failed`, { variant: 'error' });
    } finally {
      setExporting(null);
    }
  };

  return (
    <PageShell
      title="Reports"
      description="Pick a report, scope it, preview it on screen, export it — the preview and every format contain exactly the same rows."
      actions={
        <>
          {(['CSV', 'Excel', 'PDF'] as const).map((format) => (
            <Tooltip key={format} title={`Download the ${report.label} (as previewed below) as a ${format} file`}>
              <span>
                <Button
                  variant="pillOutlined"
                  disabled={exporting !== null || !rangeReady}
                  onClick={() => void doExport(format)}
                >
                  {exporting === format ? 'Exporting…' : `⬇ ${format}`}
                </Button>
              </span>
            </Tooltip>
          ))}
          <Tooltip title="Manage reports that email themselves on a schedule">
            <Button variant="pill" component={RouterLink} to="/admin/reports/scheduled">
              🕐 Automated reports
            </Button>
          </Tooltip>
        </>
      }
    >
      {/* Round 61 — one card for the whole scope: pick the report, then the
          period that report covers. The hint names the selected report so it
          reads unambiguously as "this period filters these downloads". */}
      <Paper
        variant="outlined"
        sx={{ p: 1.5, px: 2, mb: 2, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1.25, bgcolor: 'rgba(255,255,255,0.6)' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', minWidth: 56 }}>Period</Typography>
          <RadioGroup row value={period} onChange={(e) => setPeriod(e.target.value as 'all' | 'custom')}>
            <FormControlLabel value="all" control={<Radio size="small" />} disabled={!report.period}
              label={<Typography sx={{ fontSize: '0.9rem' }}>All</Typography>} />
            <FormControlLabel value="custom" control={<Radio size="small" />} disabled={!report.period}
              label={<Typography sx={{ fontSize: '0.9rem' }}>Custom range</Typography>} />
          </RadioGroup>
          {report.period && period === 'custom' && (
            <>
              <TextField
                label="From" type="date" size="small" InputLabelProps={{ shrink: true }}
                value={from} onChange={(e) => setFrom(e.target.value)}
              />
              <TextField
                label="To" type="date" size="small" InputLabelProps={{ shrink: true }}
                value={to} onChange={(e) => setTo(e.target.value)}
                error={!!from && !!to && from > to}
              />
            </>
          )}
          <Typography sx={{ fontSize: '0.78rem', color: rangeReady ? 'text.secondary' : 'error.main' }}>
            {!report.period
              ? `The ${report.label.toLowerCase()} ignores the period${reportType === 'calendar' ? ' — it covers the chosen year' : ' — it describes who people are, not what they did'}.`
              : period === 'all'
                ? `The ${report.label} preview and its CSV / Excel / PDF downloads cover all time.`
                : rangeReady
                  ? `The ${report.label} preview and its CSV / Excel / PDF downloads contain only ${from} to ${to} (inclusive).`
                  : 'Pick both dates (From on or before To) to apply the range to the downloads.'}
          </Typography>
        </Box>
        <Divider sx={{ borderColor: 'rgba(31,43,54,0.08)' }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', minWidth: 56 }}>Report</Typography>
          {REPORTS.map((r) => (
            <Button
              key={r.type}
              size="small"
              variant="pillOutlined"
              onClick={() => setReportType(r.type)}
              sx={
                reportType === r.type
                  ? {
                      bgcolor: `${alpha(tokens.accent, 0.14)} !important`,
                      borderColor: `${tokens.accent} !important`,
                      fontWeight: 700,
                    }
                  : undefined
              }
            >
              {r.label}
            </Button>
          ))}
          {reportType === 'calendar' && (
            <TextField
              label="Year" type="number" size="small" sx={{ width: 110 }}
              InputLabelProps={{ shrink: true }}
              value={year} onChange={(e) => setYear(e.target.value)}
            />
          )}
        </Box>
      </Paper>

      {/* The preview — the volunteer summary keeps its rich table; every other
          report renders the generic preview of exactly what the export holds. */}
      {reportType !== 'volunteers' && (
        <>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {preview.data?.title ?? report.label}
            {preview.data && (
              <Typography component="span" sx={{ ml: 1, fontSize: '0.8rem', color: 'text.secondary' }}>
                {preview.data.total} row(s){preview.data.truncated ? ' — preview shows the first 500; exports contain all' : ''}
              </Typography>
            )}
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 3, mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {(preview.data?.columns ?? []).map((c) => (
                    <TableCell key={c.key} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{c.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {(preview.data?.data ?? []).map((row, i) => (
                  <TableRow key={i}>
                    {(preview.data?.columns ?? []).map((c) => (
                      <TableCell key={c.key} sx={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                        {row[c.key] === null || row[c.key] === undefined || row[c.key] === ''
                          ? '—'
                          : String(row[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {preview.data && preview.data.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={preview.data.columns.length} sx={{ py: 3, color: 'text.secondary' }}>
                      No rows in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {reportType === 'volunteers' && (
        <>
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
        </>
      )}

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
