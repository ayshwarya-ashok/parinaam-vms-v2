import axios from 'axios';
import { API_BASE_URL, type ApiError } from './client';

/**
 * Bare client for the signed-link forms. Recipients have no session, so this
 * client carries no bearer token, no cookies, and no silent-refresh
 * interceptor — the token in the URL is the whole identity.
 */
export const linkApi = axios.create({ baseURL: API_BASE_URL, timeout: 30_000 });

export interface LinkEventInfo {
  name: string;
  date: string;
  startTime: string;
  durationHours: string;
  location: string | null;
}

export interface VolunteerFormContext {
  event: LinkEventInfo;
  volunteerName: string;
  alreadySubmitted: boolean;
}

export interface FeedbackLinkContext {
  event: LinkEventInfo & { programName: string; hoursContributed: string | null };
  volunteerName: string;
  alreadySubmitted: boolean;
  options: { issues: string[]; improvements: string[] };
}

export interface CoordinatorFormContext {
  event: LinkEventInfo;
  coordinatorName: string;
  enrolledCount: number;
  alreadySubmitted: boolean;
}

export type LinkFailure = 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_CONSUMED' | 'UNKNOWN';

export function linkFailureOf(err: unknown): LinkFailure {
  if (axios.isAxiosError(err)) {
    const code = (err.response?.data as ApiError | undefined)?.code;
    if (code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED' || code === 'TOKEN_CONSUMED') {
      return code;
    }
  }
  return 'UNKNOWN';
}

export const fetchVolunteerForm = async (token: string) =>
  (await linkApi.get<VolunteerFormContext>(`/attendance/link/${token}`)).data;

export const fetchCoordinatorForm = async (token: string) =>
  (await linkApi.get<CoordinatorFormContext>(`/reports/link/${token}`)).data;

export async function submitVolunteerForm(
  token: string,
  fields: Record<string, string | boolean | undefined>,
  images: File[],
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') body.append(key, String(value));
  }
  for (const image of images.slice(0, 2)) body.append('images', image);
  return (
    await linkApi.post<{ submitted: boolean; hoursContributed: string | null }>(
      `/attendance/link/${token}`,
      body,
    )
  ).data;
}

export const fetchFeedbackForm = async (token: string) =>
  (await linkApi.get<FeedbackLinkContext>(`/feedback/link/${token}`)).data;

/** Tag arrays travel as JSON strings; everything else as plain multipart fields. */
export async function submitFeedbackForm(
  token: string,
  fields: Record<string, string | number | string[] | undefined>,
  images: File[],
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) body.append(key, JSON.stringify(value));
    } else {
      body.append(key, String(value));
    }
  }
  for (const image of images.slice(0, 2)) body.append('images', image);
  return (
    await linkApi.post<{ id: string; replaced: boolean }>(`/feedback/link/${token}`, body)
  ).data;
}

export async function submitCoordinatorForm(
  token: string,
  fields: Record<string, string | number | undefined>,
  images: File[],
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== '') body.append(key, String(value));
  }
  for (const image of images.slice(0, 2)) body.append('images', image);
  return (await linkApi.post<{ submitted: boolean }>(`/reports/link/${token}`, body)).data;
}
