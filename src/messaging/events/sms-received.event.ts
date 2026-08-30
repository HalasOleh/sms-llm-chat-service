/** The event name lives in a constant so the string cannot drift apart. */
export const SMS_RECEIVED = 'sms.received';

/**
 * What the controller knows about an incoming message after parsing and
 * normalization — and everything the handler needs.
 *
 * Deliberately a plain object with no classes or methods: when the in-process
 * bus is replaced by a queue, this event becomes the message body there
 * without rework.
 */
export interface SmsReceivedEvent {
  phoneNumber: string;
  body: string;
  providerMessageId: string;
  providerTimestamp: Date | null;
}
