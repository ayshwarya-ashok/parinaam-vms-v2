import axios, { AxiosError } from 'axios';

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api/v1';

/** The uniform error envelope every API error carries. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
  traceId: string;
}

/**
 * Access token lives in memory only — never localStorage, never a readable
 * cookie. The refresh token is an httpOnly cookie the browser sends on its own.
 */
let accessToken: string | null = null;
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 20_000,
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/**
 * Silent refresh on 401 — wired now, exercised from Phase 1 when /auth/refresh
 * exists. A single in-flight refresh is shared across concurrent 401s.
 */
let refreshing: Promise<string | null> | null = null;

api.interceptors.response.use(undefined, async (error: AxiosError<ApiError>) => {
  const original = error.config;
  const status = error.response?.status;

  if (status === 401 && original && !original.headers['X-Retried']) {
    refreshing ??= axios
      .post<{ accessToken: string }>(`${API_BASE_URL}/auth/refresh`, null, {
        withCredentials: true,
      })
      .then((r) => r.data.accessToken)
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });

    const token = await refreshing;
    if (token) {
      setAccessToken(token);
      original.headers['X-Retried'] = '1';
      return api.request(original);
    }
  }

  return Promise.reject(error);
});

/** Narrow an unknown rejection to the API's error envelope, if it is one. */
export function asApiError(err: unknown): ApiError | null {
  if (axios.isAxiosError(err) && err.response?.data?.code) {
    return err.response.data as ApiError;
  }
  return null;
}
