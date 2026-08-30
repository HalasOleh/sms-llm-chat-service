import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * Normalizes a phone number to E.164.
 *
 * The number is the only customer identity here, so everything depends on
 * "+36123456789", "36123456789" and "+36 12 345 6789" collapsing to one
 * string: otherwise a feedback message cannot find its conversation, and an
 * admin cannot find the history.
 *
 * The library does not recognise every range (it considers the number from
 * the assignment invalid, for one), so it cannot be the only path. When
 * parsing fails the number is still reduced to "+" and digits — what matters
 * is that identical input always produces identical output. Throwing is not
 * an option: storing a conversation under an odd number beats losing the
 * customer's message.
 */
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  // No digits at all — not a phone number; return as-is rather than lose it.
  if (digits.length === 0) {
    return trimmed;
  }

  const candidate = `+${digits}`;
  const parsed = parsePhoneNumberFromString(candidate);

  return parsed?.isValid() ? parsed.number : candidate;
}
