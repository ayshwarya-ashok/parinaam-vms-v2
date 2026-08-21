import { Box, Paper, TextField, Typography } from '@mui/material';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useDashboard } from '@/api/analytics';
import { usePrograms } from '@/api/admin';
import { FilterBar, PageShell, StatTile } from '@/components';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Filler,
  Legend,
  Tooltip,
);

const PALETTE = ['#d96c3f', '#8db8a6', '#0f2b2d', '#e0a458', '#7d6b91', '#5e8ca7'];
const FONT = { family: 'Inter, system-ui, sans-serif', size: 11 };
ChartJS.defaults.font = FONT as never;
ChartJS.defaults.color = '#5e6a62';

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

/**
 * The ten prototype charts, live. One request feeds everything, so a filter
 * change updates every panel consistently. Each chart carries a visually
 * hidden data table for screen readers.
 */
export function MetricsDashboard() {
  const [period, setPeriod] = useState('all');
  const [programId, setProgramId] = useState('');
  const [city, setCity] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data } = useDashboard({ period, programId, city, from, to });
  const rangeIncomplete = period === 'custom' && !(from && to);
  const rangeBackwards = period === 'custom' && Boolean(from && to) && from > to;
  const { data: programs } = usePrograms('', 'all');

  const c = data?.charts;
  const donutOpts = {
    plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 10 } } },
    maintainAspectRatio: false,
  };
  const barOpts = {
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    maintainAspectRatio: false,
  };

  return (
    <PageShell
      eyebrow="Admin › Metrics"
      title="Metrics Dashboard"
      description="Every figure below is a live query. Change period, programme or city and the whole board re-computes consistently."
    >
      <FilterBar
        groups={[
          {
            label: 'Period',
            value: period,
            onChange: setPeriod,
            options: [
              { value: 'all', label: 'All time' },
              { value: 'month', label: 'Last month' },
              { value: 'quarter', label: 'Last quarter' },
              { value: 'year', label: 'Last year' },
              { value: 'custom', label: 'Custom range' },
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
          {
            label: 'City',
            value: city || 'all',
            onChange: (v) => setCity(v === 'all' ? '' : v),
            options: [
              { value: 'all', label: 'All cities' },
              ...(data?.meta.cities ?? []).map((name) => ({ value: name, label: name })),
            ],
          },
        ]}
      />

      {period === 'custom' && (
        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 3, mb: 2, display: 'flex', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <TextField
            label="From"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            inputProps={{ max: to || undefined }}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: from || undefined }}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            error={rangeBackwards}
            helperText={rangeBackwards ? 'The end date is before the start date.' : undefined}
          />
          {rangeIncomplete && (
            <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary', alignSelf: 'center' }}>
              Pick both dates to see the numbers for that window.
            </Typography>
          )}
        </Paper>
      )}

      {/* KPI tiles */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' },
          gap: 1.5,
          mb: 3,
        }}
      >
        <StatTile label="Volunteers" value={data?.kpis.total_volunteers ?? '—'} sub={`${data?.kpis.active_volunteers ?? 0} active`} />
        <StatTile label="Hours contributed" value={data ? Number(data.kpis.total_hours) : '—'} />
        <StatTile label="Beneficiaries" value={data?.kpis.total_beneficiaries?.toLocaleString('en-IN') ?? '—'} />
        <StatTile label="Sessions run" value={data?.kpis.events_conducted ?? '—'} sub={`${data?.kpis.events_upcoming ?? 0} upcoming`} />
        <StatTile label="Avg rating" value={data && Number(data.kpis.avg_rating) > 0 ? `${data.kpis.avg_rating} ★` : '—'} />
        <StatTile label="Certificates" value={data?.kpis.certificates_issued ?? '—'} sub={`${data?.kpis.compliant_volunteers ?? 0} compliant`} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          gap: 2,
        }}
      >
        <ChartCard title="Volunteers by phase" rows={c?.volunteersByPhase} cols={['Phase', 'Count']} of={(r) => [r.label, r.count]}>
          <Doughnut
            options={donutOpts}
            data={{
              labels: (c?.volunteersByPhase ?? []).map((r) => r.label),
              datasets: [{ data: (c?.volunteersByPhase ?? []).map((r) => r.count), backgroundColor: PALETTE }],
            }}
          />
        </ChartCard>

        <ChartCard title="Volunteers by gender" rows={c?.volunteersByGender} cols={['Gender', 'Count']} of={(r) => [r.label, r.count]}>
          <Doughnut
            options={donutOpts}
            data={{
              labels: (c?.volunteersByGender ?? []).map((r) => r.label),
              datasets: [{ data: (c?.volunteersByGender ?? []).map((r) => r.count), backgroundColor: PALETTE.slice(1) }],
            }}
          />
        </ChartCard>

        <ChartCard title="Volunteers by category" rows={c?.volunteersByCategory} cols={['Category', 'Count']} of={(r) => [r.label, r.count]}>
          <Doughnut
            options={donutOpts}
            data={{
              labels: (c?.volunteersByCategory ?? []).map((r) => r.label),
              datasets: [{ data: (c?.volunteersByCategory ?? []).map((r) => r.count), backgroundColor: [PALETTE[2], PALETTE[3]] }],
            }}
          />
        </ChartCard>

        <ChartCard title="Volunteer growth" rows={c?.volunteerGrowth} cols={['Month', 'New volunteers']} of={(r) => [r.month, r.count]} wide>
          <Line
            options={{ ...barOpts, elements: { line: { tension: 0.3 } } }}
            data={{
              labels: (c?.volunteerGrowth ?? []).map((r) => monthLabel(r.month)),
              datasets: [{
                data: (c?.volunteerGrowth ?? []).map((r) => r.count),
                borderColor: PALETTE[0],
                backgroundColor: 'rgba(217,108,63,0.15)',
                fill: true,
              }],
            }}
          />
        </ChartCard>

        <ChartCard title="Monthly volunteer hours" rows={c?.monthlyHours} cols={['Month', 'Hours']} of={(r) => [r.month, r.hours]}>
          <Bar
            options={barOpts}
            data={{
              labels: (c?.monthlyHours ?? []).map((r) => monthLabel(r.month)),
              datasets: [{ data: (c?.monthlyHours ?? []).map((r) => Number(r.hours)), backgroundColor: PALETTE[1] }],
            }}
          />
        </ChartCard>

        <ChartCard title="Beneficiaries impacted" rows={c?.beneficiariesByMonth} cols={['Month', 'Beneficiaries']} of={(r) => [r.month, r.beneficiaries]}>
          <Bar
            options={barOpts}
            data={{
              labels: (c?.beneficiariesByMonth ?? []).map((r) => monthLabel(r.month)),
              datasets: [{ data: (c?.beneficiariesByMonth ?? []).map((r) => r.beneficiaries), backgroundColor: PALETTE[3] }],
            }}
          />
        </ChartCard>

        <ChartCard
          title="Attendance: enrolled vs attended"
          rows={c?.attendanceByProgram}
          cols={['Programme', 'Enrolled', 'Attended']}
          of={(r) => [r.label, r.enrolled, r.attended]}
          wide
        >
          <Bar
            options={{
              ...barOpts,
              plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 10 } } },
            }}
            data={{
              labels: (c?.attendanceByProgram ?? []).map((r) => r.label),
              datasets: [
                { label: 'Enrolled', data: (c?.attendanceByProgram ?? []).map((r) => r.enrolled), backgroundColor: PALETTE[2] },
                { label: 'Attended', data: (c?.attendanceByProgram ?? []).map((r) => r.attended), backgroundColor: PALETTE[1] },
              ],
            }}
          />
        </ChartCard>

        <ChartCard title="Feedback ratings" rows={c?.ratingDistribution} cols={['Rating', 'Count']} of={(r) => [`${r.rating}★`, r.count]}>
          <Bar
            options={barOpts}
            data={{
              labels: (c?.ratingDistribution ?? []).map((r) => `${r.rating}★`),
              datasets: [{ data: (c?.ratingDistribution ?? []).map((r) => r.count), backgroundColor: PALETTE[0] }],
            }}
          />
        </ChartCard>

        <ChartCard title="Session status" rows={c?.eventStatus} cols={['Status', 'Count']} of={(r) => [r.label, r.count]}>
          <Doughnut
            options={donutOpts}
            data={{
              labels: (c?.eventStatus ?? []).map((r) => r.label),
              datasets: [{ data: (c?.eventStatus ?? []).map((r) => r.count), backgroundColor: [PALETTE[1], PALETTE[0], PALETTE[4], PALETTE[2]] }],
            }}
          />
        </ChartCard>

        <ChartCard
          title="Mandatory training completion"
          rows={c?.trainingCompletion}
          cols={['Training', 'Passed', 'Eligible']}
          of={(r) => [r.label, r.passed, r.eligible]}
        >
          <Bar
            options={{
              ...barOpts,
              indexAxis: 'y' as const,
              scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
            }}
            data={{
              labels: (c?.trainingCompletion ?? []).map((r) => r.label.replace(' Compliance', '')),
              datasets: [
                { label: 'Passed', data: (c?.trainingCompletion ?? []).map((r) => r.passed), backgroundColor: PALETTE[1] },
                { label: 'Eligible', data: (c?.trainingCompletion ?? []).map((r) => r.eligible), backgroundColor: 'rgba(19,35,37,0.15)' },
              ],
            }}
          />
        </ChartCard>
      </Box>
    </PageShell>
  );
}

/** Chart panel with an sr-only table mirroring the visual data. */
function ChartCard<T>({
  title,
  children,
  rows,
  cols,
  of,
  wide,
}: {
  title: string;
  children: React.ReactNode;
  rows: T[] | undefined;
  cols: string[];
  of: (row: T) => Array<string | number>;
  wide?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{ p: 2, borderRadius: 3, gridColumn: wide ? { sm: 'span 2' } : undefined }}
    >
      <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', mb: 1 }}>{title}</Typography>
      <Box sx={{ height: 220 }}>{children}</Box>
      <Box
        component="table"
        sx={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
        }}
      >
        <caption>{title}</caption>
        <thead>
          <tr>{cols.map((col) => <th key={col} scope="col">{col}</th>)}</tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, i) => (
            <tr key={i}>{of(row).map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </Box>
    </Paper>
  );
}
