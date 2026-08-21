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
 *
 * A prefix is only a prefix when the length says so: "91" at the start of a
 * TWELVE-digit string is a country code, but at the start of a ten-digit one
 * it is the first two digits of a real number (the 91xxxxxxxx series exists),
 * and stripping it blindly rejected valid numbers as "8 digits".
 */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[\s\-()]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
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

/**
 * The identity fields every volunteer record must carry.
 *
 * These are the ones a coordinator needs to run a session safely: who is
 * coming, how to reach them on the day, and where they are. They are required
 * in all three places a volunteer record is written — public registration, the
 * volunteer's own profile, and an admin correcting a pending registration — so
 * the rule lives here rather than being restated (and drifting) in each.
 */
export interface RequiredProfileFields {
  firstName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
}

export type ProfileErrors = Partial<Record<keyof RequiredProfileFields, string>>;

const LABELS: Record<keyof RequiredProfileFields, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  gender: 'Gender',
  dateOfBirth: 'Date of birth',
  city: 'City',
  state: 'State',
  phone: 'Phone number',
};

export function validateProfile(form: RequiredProfileFields): ProfileErrors {
  const problems: ProfileErrors = {};

  for (const key of Object.keys(LABELS) as Array<keyof RequiredProfileFields>) {
    if (String(form[key] ?? '').trim() === '') {
      problems[key] = `${LABELS[key]} is required.`;
    }
  }

  // A future date of birth is a typo, not a person.
  const dob = String(form.dateOfBirth ?? '').trim();
  if (dob !== '' && dob > new Date().toISOString().slice(0, 10)) {
    problems.dateOfBirth = 'A date of birth cannot be in the future.';
  }

  const badPhone = phoneError(form.phone, true);
  if (badPhone) problems.phone = badPhone;

  return problems;
}

/** The first message, for the toast that accompanies the inline errors. */
export function firstProblem(problems: ProfileErrors): string {
  const messages = Object.values(problems).filter(Boolean) as string[];
  return messages.length === 1 ? messages[0] : `Check the ${messages.length} highlighted fields.`;
}
