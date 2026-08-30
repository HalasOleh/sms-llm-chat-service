/**
 * Truncates text to a maximum length without cutting a word in half.
 *
 * This guards the bill, not the looks: the model can ignore the instruction
 * to be brief, and then a single answer becomes ten billed SMS segments.
 * The prompt is a request; this limit is the guarantee.
 */
export function truncateForSms(text: string, maxLength: number): string {
  const normalized = text.trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const ellipsis = '…';
  const hardLimit = maxLength - ellipsis.length;
  const clipped = normalized.slice(0, hardLimit);
  const lastSpace = clipped.lastIndexOf(' ');

  // Cut on a word boundary only when that does not discard most of the text.
  const body =
    lastSpace > hardLimit * 0.6 ? clipped.slice(0, lastSpace) : clipped;

  return `${body.trimEnd()}${ellipsis}`;
}
