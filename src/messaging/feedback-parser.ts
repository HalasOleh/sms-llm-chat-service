import { Feedback } from '../conversations/conversation.entity';

const POSITIVE_MARKERS = ['👍', '1', '+', 'y', 'yes'];
const NEGATIVE_MARKERS = ['👎', '0', '-', 'n', 'no'];

/**
 * Recognises a feedback message.
 *
 * A pure function with no dependencies — which is exactly why its edge cases
 * are cheap to cover with tests, and they are not obvious here.
 *
 * The key rule: a message counts as feedback only if it consists ENTIRELY of
 * a marker. Otherwise "1 more question please" would become a rating, and the
 * customer's real question would be silently swallowed.
 *
 * `null` means "this is an ordinary message", not "parsing failed".
 */
export function parseFeedback(body: string): Feedback | null {
  const normalized = body.trim().toLowerCase();

  if (normalized.length === 0) {
    return null;
  }

  if (POSITIVE_MARKERS.includes(normalized)) {
    return Feedback.Positive;
  }

  if (NEGATIVE_MARKERS.includes(normalized)) {
    return Feedback.Negative;
  }

  return null;
}
