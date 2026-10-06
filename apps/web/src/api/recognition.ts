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
    // Live search: keep the previous rows on screen while the next load runs.
    placeholderData: (prev) => prev,
  });

export interface MyCertificate {
  id: string;
  certificateNumber: string;
  kind: 'program' | 'custom';
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
export async function fetchCertificateBlob(id: string): Promise<{ blob: Blob; filename: string }> {
  const res = await api.get(`/certificates/${id}/download`, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? `certificate-${id}.pdf`;
  return { blob: res.data as Blob, filename };
}

// ── Custom certificates (Round 48) ───────────────────────────────────────────

export interface VolunteerCertificate {
  id: string;
  certificateNumber: string;
  kind: 'program' | 'custom';
  programName: string | null;
  customText: string | null;
  hours: string;
  eventsAttended: number;
  certType: 'individual' | 'corporate';
  issuedAt: string;
  resendCount: number;
}

/** Every certificate issued to one volunteer — staff view. */
export const useVolunteerCertificates = (volunteerId: string | null) =>
  useQuery({
    queryKey: ['certificates', 'volunteer', volunteerId],
    queryFn: async () =>
      (await api.get<{ data: VolunteerCertificate[] }>(`/certificates/volunteer/${volunteerId}`)).data.data,
    enabled: !!volunteerId,
  });

/** Watermarked render of the custom certificate — nothing stored server-side. */
export async function fetchCustomPreviewBlob(volunteerId: string, content: string): Promise<Blob> {
  const res = await api.post(
    '/certificates/custom/preview',
    { volunteerId, content },
    { responseType: 'blob' },
  );
  return res.data as Blob;
}

export async function openCertificate(id: string): Promise<void> {
  const { blob, filename } = await fetchCertificateBlob(id);

  const url = URL.createObjectURL(blob);
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
  is_anonymous: boolean;
  volunteer_name: string;
  event_name: string;
  /** NULL on anonymous submissions — they concern no single session. */
  event_date: string | null;
  program_id: string;
  program_name: string;
  issues: string[];
  improvements: string[];
  photo_count: number;
}

export interface FeedbackPhoto {
  id: string;
  url: string;
  fullUrl: string;
}

/**
 * The API signs photo URLs against its public host, but the app serves from
 * one origin (Caddy/Vite proxy) and helmet's Cross-Origin-Resource-Policy
 * blocks cross-origin images. The signature covers only path+expiry, so the
 * same signed query is valid through the app's own /api base — rewrite to it.
 */
function sameOriginSigned(url: string): string {
  const query = url.split('/files/signed')[1] ?? '';
  return `${api.defaults.baseURL}/files/signed${query}`;
}

/** Photos attached to one submission — staff detail drawer (Round 52). */
export const useFeedbackPhotos = (feedbackId: string | null) =>
  useQuery({
    queryKey: ['feedback', 'photos', feedbackId],
    queryFn: async () => {
      const rows = (await api.get<{ data: FeedbackPhoto[] }>(`/feedback/${feedbackId}/photos`)).data.data;
      return rows.map((p) => ({ ...p, url: sameOriginSigned(p.url), fullUrl: sameOriginSigned(p.fullUrl) }));
    },
    enabled: !!feedbackId,
  });

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
