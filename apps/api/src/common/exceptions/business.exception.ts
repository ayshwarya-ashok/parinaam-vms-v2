import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A rule the system deliberately enforces, not a fault.
 *
 * The `code` is part of the API contract — the web client switches on it to
 * decide whether to open the waitlist modal, the conflict modal, or the
 * "training required" lock state. See docs/04-api-specification.md.
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

/** The catalog. Keep in step with docs/04-api-specification.md. */
export const BusinessErrors = {
  prerequisitesNotMet: (missingTrainings: unknown[]) =>
    new BusinessException(
      'PREREQUISITES_NOT_MET',
      'Complete the required trainings before enrolling.',
      HttpStatus.CONFLICT,
      { missingTrainings },
    ),

  eventFull: (maxSlots: number, waitlistPosition: number) =>
    new BusinessException(
      'ACTIVITY_FULL',
      'This session has no remaining slots.',
      HttpStatus.CONFLICT,
      { maxSlots, waitlistPosition },
    ),

  schedulingConflict: (conflictingEvent: unknown) =>
    new BusinessException(
      'SCHEDULING_CONFLICT',
      'This session overlaps with one you are already enrolled in.',
      HttpStatus.CONFLICT,
      { conflictingEvent },
    ),

  alreadyEnrolled: () =>
    new BusinessException('ALREADY_ENROLLED', 'You are already enrolled in this session.'),

  eventNotEnrollable: (reason?: string) =>
    new BusinessException(
      'EVENT_NOT_ENROLLABLE',
      'This session is not open for enrollment.',
      HttpStatus.CONFLICT,
      reason ? { reason } : undefined,
    ),

  consentRequired: () =>
    new BusinessException(
      'CONSENT_REQUIRED',
      'Sign the compliance agreement before accessing training.',
      HttpStatus.FORBIDDEN,
    ),

  attemptsExhausted: (maxAttempts: number) =>
    new BusinessException(
      'ATTEMPTS_EXHAUSTED',
      'No attempts remaining. Contact an administrator to reset.',
      HttpStatus.CONFLICT,
      { maxAttempts },
    ),

  feedbackAlreadySubmitted: () =>
    new BusinessException(
      'FEEDBACK_ALREADY_SUBMITTED',
      'You have already submitted feedback for this session.',
    ),

  contentChanged: () =>
    new BusinessException(
      'CONTENT_CHANGED',
      'Materials changed. Decide whether to reset existing assessment scores.',
    ),

  invalidSignature: () =>
    new BusinessException(
      'INVALID_SIGNATURE',
      'Request signature is missing or invalid.',
      HttpStatus.UNAUTHORIZED,
    ),

  tokenInvalid: (code: 'TOKEN_EXPIRED' | 'TOKEN_CONSUMED' | 'TOKEN_INVALID') =>
    new BusinessException(
      code,
      'This link is no longer valid.',
      HttpStatus.UNAUTHORIZED,
    ),
} as const;
