/**
 * Shared contract types between apps/api and apps/web.
 *
 * Currently REFERENCE, not runtime: neither app imports this package yet — the
 * API's BusinessException catalog and the web's api/ types grew in place
 * during the phases. This file is kept in sync so a future extraction has a
 * ready home; if you add a business error code, add it here too.
 */

/**
 * Stable business error codes — the UI branches on these, never on message
 * text. Synced against every `new BusinessException('…')` in apps/api
 * (2026-08-22).
 */
export const BUSINESS_ERROR_CODES = [
  // auth & account
  'ACCOUNT_DEACTIVATED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_NOT_FOUND',
  'EMAIL_TAKEN',
  'INVALID_PASSWORD',
  'INVALID_SIGNATURE',
  // registration & review
  'ALREADY_REGISTERED',
  'ALREADY_REVIEWED',
  'ORGANIZATION_REQUIRED',
  'PROFILE_INCOMPLETE',
  'REASON_REQUIRED',
  'REGISTRATION_PENDING',
  'REGISTRATION_REJECTED',
  'REGISTRATION_REVIEWED',
  // consent
  'ALREADY_SIGNED',
  'CONSENT_INCOMPLETE',
  'CONSENT_REQUIRED',
  // programmes / activities / sessions / communities
  'COMMUNITY_INVALID',
  'COMMUNITY_REQUIRED',
  'COORDINATOR_REQUIRED',
  'NAME_TAKEN',
  'EMPTY_SERIES',
  'EVENT_CANCELLED',
  'NOT_DRAFT',
  'NOT_UPCOMING',
  'NOT_YET_RUN',
  'PHASED_SESSION',
  'PHASE_ALREADY_MARKED',
  'PHASE_LOCKED',
  'PHASE_NOT_YOURS',
  'PROGRAM_DISCONTINUED',
  // enrollment
  'ACTIVITY_FULL',
  'ALREADY_ENROLLED',
  'ALREADY_WAITLISTED',
  'EVENT_NOT_ENROLLABLE',
  'PREREQUISITES_NOT_MET',
  'SCHEDULING_CONFLICT',
  // trainings & quizzes
  'ALREADY_PASSED',
  'ATTEMPTS_EXHAUSTED',
  'CONTENT_CHANGED',
  'INCOMPLETE_QUIZ',
  'MANDATORY_NEEDS_LIMITS',
  'NO_QUIZ',
  'QUESTION_INVALID',
  'UNSUPPORTED_FILE_TYPE',
  // attendance & link tokens
  'HOURS_REQUIRED',
  'NOT_ENROLLED',
  'TIMES_REQUIRED',
  'TOKEN_CONSUMED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'VISIT_INVALID',
  'WALKIN_NOT_ELIGIBLE',
  // recognition & feedback
  'ALREADY_ISSUED',
  'FEEDBACK_ALREADY_SUBMITTED',
  'NOT_ATTENDED',
  'NOT_ELIGIBLE',
  // reports
  'UNKNOWN_REPORT_TYPE',
] as const;

export type BusinessErrorCode = (typeof BUSINESS_ERROR_CODES)[number];

/** The Program -> Activity -> Event hierarchy, as string unions for the UI. */
export type ProgramStatus = 'draft' | 'active' | 'discontinued';
export type ActivityStatus = 'active' | 'discontinued';
export type EventStatus = 'draft' | 'upcoming' | 'completed' | 'cancelled';
export type VolunteerPhase = 'Onboarding' | 'In Training' | 'Active' | 'Inactive';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
