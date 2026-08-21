import { useQuery } from '@tanstack/react-query';
import { api } from './client';

// ── Certificates ─────────────────────────────────────────────────────────────

export interface CertificateCandidate {
  volunteerId: string;
  volunteerName: string;
  email: string;
  category: 'Individual' | 'CSR';
  organizationName: string | null;
  programId: string;
  programCode: string | null;
  programName: string;
  eventsAttended: number;
  hours: string;
  periodStart: string | null;
  periodEnd: string | null;
  certificate: {
    id: string;
    certificateNumber: string | null;
    issued: boolean;
    issuedAt: string | null;
    resendCount: number;
    hours: string;
    stale: boolean;
  } | null;
}

export const useCertificateCandidates = (filters: {
  q?: string;
  programId?: string;
  status?: string;
}) =>
  useQuery({
    queryKey: ['certificates', filters],
    queryFn: async () =>
      (
        await api.get<{ data: CertificateCandidate[] }>('/certificates', {
          params: {
            q: filters.q || undefined,
            programId: filters.programId || undefined,
            status: filters.status === 'all' ? undefined : filters.status,
          },
        })
      ).data.data,
  });

export interface MyCertificate {
  id: string;
  certificateNumber: string;
  programName: string;
  hours: string;
  eventsAttended: number;
  periodStart: string | null;
  periodEnd: string | null;
  certType: 'individual' | 'corporate';
  issuedAt: string;
}

export const useMyCertificates = () =>
  useQuery({
    queryKey: ['certificates', 'me'],
    queryFn: async () => (await api.get<{ data: MyCertificate[] }>('/certificates/me')).data.data,
  });

/**
 * Downloads go through the authenticated client — a plain <a href> carries no
 * token. The server sends the file name in Content-Disposition
 * (<volunteerId>-<certificateNumber>.pdf); we save under that rather than
 * window.open()ing the blob, which would name the file after a browser GUID.
 */
export async function openCertificate(id: string): Promise<void> {
  const res = await api.get(`/certificates/${id}/download`, { responseType: 'blob' });

  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `certificate-${id}.pdf`;

  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export interface FeedbackOptions {
  issues: string[];
  improvements: string[];
}

export const useFeedbackOptions = () =>
  useQuery({
    queryKey: ['feedback', 'options'],
    queryFn: async () => (await api.get<FeedbackOptions>('/feedback/options')).data,
    staleTime: 5 * 60_000,
  });

export interface EligibleEvent {
  id: string;
  code: string;
  name: string;
  date: string;
  start_time: string;
  location: string | null;
  program_name: string;
  hours_contributed: string | null;
}

export const useEligibleEvents = () =>
  useQuery({
    queryKey: ['feedback', 'eligible'],
    queryFn: async () => (await api.get<{ data: EligibleEvent[] }>('/feedback/eligible-events')).data.data,
  });

export interface MyFeedback {
  id: string;
  overall_rating: number;
  nps_score: number;
  vol_again: string | null;
  comments: string | null;
  is_published_testimonial: boolean;
  submitted_at: string;
  event_name: string;
  date: string;
  program_name: string;
}

export const useMyFeedback = () =>
  useQuery({
    queryKey: ['feedback', 'me'],
    queryFn: async () => (await api.get<{ data: MyFeedback[] }>('/feedback/me')).data.data,
  });

export interface SubmitFeedbackPayload {
  eventId: string;
  overallRating: number;
  npsScore: number;
  volAgain?: string;
  wentWell?: string;
  issues?: string[];
  wentWrongDetail?: string;
  improvements?: string[];
  improvementDetail?: string;
  comments?: string;
}

export interface AdminFeedbackRow {
  id: string;
  overall_rating: number;
  nps_score: number;
  vol_again: string | null;
  went_well: string | null;
  went_wrong_detail: string | null;
  improvement_detail: string | null;
  comments: string | null;
  is_published_testimonial: boolean;
  submitted_at: string;
  volunteer_name: string;
  event_name: string;
  event_date: string;
  program_id: string;
  program_name: string;
  issues: string[];
  improvements: string[];
}

export const useAdminFeedback = (filters: { programId?: string; rating?: string }) =>
  useQuery({
    queryKey: ['feedback', 'admin', filters],
    queryFn: async () =>
      (
        await api.get<{ data: AdminFeedbackRow[] }>('/feedback', {
          params: {
            programId: filters.programId || undefined,
            rating: filters.rating && filters.rating !== 'all' ? filters.rating : undefined,
          },
        })
      ).data.data,
  });

export interface FeedbackAnalytics {
  total: number;
  avgRating: number | null;
  avgNps: number | null;
  nps: number | null;
  published: number;
  ratingDistribution: Array<{ rating: number; count: number }>;
  volAgainDistribution: Array<{ answer: string; count: number }>;
  topIssues: Array<{ label: string; count: number }>;
  topImprovements: Array<{ label: string; count: number }>;
}

export const useFeedbackAnalytics = (programId?: string) =>
  useQuery({
    queryKey: ['feedback', 'analytics', programId ?? ''],
    queryFn: async () =>
      (
        await api.get<FeedbackAnalytics>('/feedback/analytics', {
          params: { programId: programId || undefined },
        })
      ).data,
  });
