/**
 * Shared contract types between apps/api and apps/web.
 *
 * Phase 1 populates this with the auth and volunteer Zod schemas so the form
 * validation the browser runs is the same validation the API enforces.
 */

/** Stable business error codes — the UI branches on these. */
export const BUSINESS_ERROR_CODES = [
  'PREREQUISITES_NOT_MET',
  'ACTIVITY_FULL',
  'SCHEDULING_CONFLICT',
  'ALREADY_ENROLLED',
  'EVENT_NOT_ENROLLABLE',
  'CONSENT_REQUIRED',
  'ATTEMPTS_EXHAUSTED',
  'CERTIFICATION_EXPIRED',
  'FEEDBACK_ALREADY_SUBMITTED',
  'CONTENT_CHANGED',
  'TOKEN_EXPIRED',
  'TOKEN_CONSUMED',
  'TOKEN_INVALID',
  'INVALID_SIGNATURE',
  'ACCOUNT_LOCKED',
] as const;

export type BusinessErrorCode = (typeof BUSINESS_ERROR_CODES)[number];

/** The Program -> Activity -> Event hierarchy, as string unions for the UI. */
export type ProgramStatus = 'draft' | 'active' | 'discontinued';
export type ActivityStatus = 'active' | 'discontinued';
export type EventStatus = 'draft' | 'upcoming' | 'completed' | 'cancelled';
export type VolunteerPhase = 'Onboarding' | 'In Training' | 'Active' | 'Inactive';
