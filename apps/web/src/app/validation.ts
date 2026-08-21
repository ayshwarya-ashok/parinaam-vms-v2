/**
 * Validation shared across every form that asks for the same thing.
 *
 * These mirror rules the API enforces; the point here is the message arriving
 * without a round trip, not the enforcement.
 */

/**
 * Indian mobile numbers are ten digits. Spaces, dashes and a +91 country code
 * are how people actually type them, so those are stripped before counting
 * rather than rejected — the rule is about the number, not the punctuation.
 */
export function normalizePhone(input: string): string {
  return input.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)/, '');
}

export function phoneError(input: string | null | undefined, required = false): string | null {
  const raw = (input ?? '').trim();
  if (raw === '') return required ? 'A contact number is required.' : null;

  const digits = normalizePhone(raw);
  if (!/^\d+$/.test(digits)) return 'A phone number can only contain digits.';
  if (digits.length !== 10) return 'Enter a 10-digit mobile number.';
  return null;
}

/** What we send once it passes: the bare ten digits. */
export function phoneForApi(input: string | null | undefined): string | undefined {
  const raw = (input ?? '').trim();
  return raw === '' ? undefined : normalizePhone(raw);
}
