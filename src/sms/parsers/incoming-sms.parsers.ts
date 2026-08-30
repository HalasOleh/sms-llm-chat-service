import { BadRequestException } from '@nestjs/common';

import type { IncomingSms } from '../sms-provider.interface';

/**
 * Parsing of incoming webhooks.
 *
 * These are pure functions rather than provider methods, and that matters.
 * The payload format is determined by the ROUTE the request arrived on, not
 * by who the service sends replies through. While parsing lived in the
 * provider, /webhook/sms/twilio only worked when SMS_PROVIDER=twilio — so
 * receiving real Twilio webhooks while replying through the mock (an ordinary
 * staging setup) was impossible. The split also narrows ISmsProvider down to
 * a single responsibility: sending.
 */

const parseTimestamp = (value: unknown): Date | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : null;

/** The generic JSON format from the assignment. */
export function parseGenericSms(payload: unknown): IncomingSms {
  const data = payload as Record<string, unknown> | null;

  const from = typeof data?.from === 'string' ? data.from : null;
  const body = typeof data?.body === 'string' ? data.body : null;
  const messageId = typeof data?.messageId === 'string' ? data.messageId : null;

  if (!from || !body || !messageId) {
    throw new BadRequestException(
      'Expected JSON body with "from", "body" and "messageId"',
    );
  }

  return { from, body, messageId, timestamp: parseTimestamp(data?.timestamp) };
}

/** Twilio's standard form-encoded format. */
export function parseTwilioSms(payload: unknown): IncomingSms {
  const data = payload as Record<string, unknown> | null;

  const from = typeof data?.From === 'string' ? data.From : null;
  const body = typeof data?.Body === 'string' ? data.Body : null;
  const messageId =
    typeof data?.MessageSid === 'string' ? data.MessageSid : null;

  if (!from || !messageId) {
    throw new BadRequestException(
      'Expected Twilio webhook payload with "From" and "MessageSid"',
    );
  }

  // An empty body is legitimate (an attachment on its own, for instance) and
  // must not break message intake.
  return {
    from,
    body: body ?? '',
    messageId,
    timestamp: parseTimestamp(data?.DateSent),
  };
}
