import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface DashboardKpis {
  total_volunteers: number;
  active_volunteers: number;
  total_hours: string;
  sessions_with_attendance: number;
  events_conducted: number;
  events_upcoming: number;
  events_inprogress: number;
  total_beneficiaries: number;
  avg_rating: string;
  certificates_issued: number;
  compliant_volunteers: number;
}

export interface DashboardPayload {
  filters: { period: string; programId?: string; city?: string };
  kpis: DashboardKpis;
  charts: {
    volunteersByGender: Array<{ label: string; count: number }>;
    volunteersByCategory: Array<{ label: string; count: number }>;
    volunteersByPhase: Array<{ label: string; count: number }>;
    programStatus: Array<{ label: string; count: number }>;
    eventStatus: Array<{ label: string; count: number }>;
    volunteerGrowth: Array<{ month: string; count: number }>;
    monthlyHours: Array<{ month: string; hours: string }>;
    beneficiariesByMonth: Array<{ month: string; beneficiaries: number }>;
    attendanceByProgram: Array<{ label: string; enrolled: number; attended: number }>;
    ratingDistribution: Array<{ rating: number; count: number }>;
    trainingCompletion: Array<{ label: string; passed: number; eligible: number }>;
  };
  meta: { cities: string[] };
}

export const useDashboard = (filters: {
  period: string;
  programId?: string;
  city?: string;
  from?: string;
  to?: string;
}) =>
  useQuery({
    queryKey: ['dashboard', filters],
    queryFn: async () =>
      (
        await api.get<DashboardPayload>('/analytics/dashboard', {
          params: {
            period: filters.period,
            programId: filters.programId || undefined,
            city: filters.city || undefined,
            from: filters.period === 'custom' ? filters.from || undefined : undefined,
            to: filters.period === 'custom' ? filters.to || undefined : undefined,
          },
        })
      ).data,
    // A half-entered custom range would query the wrong window; wait for both.
    enabled: filters.period !== 'custom' || Boolean(filters.from && filters.to),
  });

// ── Reports ──────────────────────────────────────────────────────────────────

export interface VolunteerReportRow {
  volunteer_name: string;
  email: string;
  location: string | null;
  category: string;
  phase: string;
  programs_joined: number;
  events_enrolled: number;
  total_hours: string;
  attendance_pct: string;
  trainings_passed: number;
  avg_rating: string | null;
  certificates_issued: number;
}

export const useVolunteerReport = (filters: {
  q?: string;
  category?: string;
  phase?: string;
  city?: string;
}) =>
  useQuery({
    queryKey: ['report-volunteers', filters],
    queryFn: async () =>
      (
        await api.get<{ data: VolunteerReportRow[] }>('/reports/volunteers', {
          params: {
            q: filters.q || undefined,
            category: filters.category && filters.category !== 'all' ? filters.category : undefined,
            phase: filters.phase && filters.phase !== 'all' ? filters.phase : undefined,
            city: filters.city && filters.city !== 'all' ? filters.city : undefined,
          },
        })
      ).data.data,
  });

export interface ReportRunRow {
  id: string;
  reportType: string;
  format: 'PDF' | 'Excel' | 'CSV';
  status: 'pending' | 'running' | 'success' | 'failed';
  rowCount: number | null;
  errorMessage: string | null;
  scheduledReportId: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export const useReportRuns = () =>
  useQuery({
    queryKey: ['report-runs'],
    queryFn: async () => (await api.get<{ data: ReportRunRow[] }>('/reports/runs')).data.data,
  });

/** Export → poll-free: the API generates synchronously and we download the run. */
export async function exportAndDownload(
  reportType: string,
  format: 'PDF' | 'Excel' | 'CSV',
  filters: Record<string, unknown>,
): Promise<void> {
  const { data: run } = await api.post<{ runId: string }>('/reports/export', {
    reportType,
    format,
    filters,
  });
  const res = await api.get(`/reports/runs/${run.runId}/download`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${reportType}.${format === 'Excel' ? 'xlsx' : format.toLowerCase()}`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ScheduledReportRow {
  id: string;
  name: string;
  reportType: string;
  format: 'PDF' | 'Excel' | 'CSV';
  frequency: 'Daily' | 'Weekly' | 'Monthly';
  sendTime: string;
  timezone: string;
  recipients: string;
  isActive: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export const useScheduledReports = () =>
  useQuery({
    queryKey: ['scheduled-reports'],
    queryFn: async () =>
      (await api.get<{ data: ScheduledReportRow[] }>('/reports/scheduled')).data.data,
  });
