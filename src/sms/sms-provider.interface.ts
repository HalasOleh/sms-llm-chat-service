export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** An incoming message in a shape that no longer depends on the provider. */
export interface IncomingSms {
  from: string;
  body: string;
  messageId: string;
  timestamp: Date | null;
}

/**
 * The SMS provider contract: transport only.
 *
 * A deliberately narrow interface. A provider can parse its own webhook
 * format and send a message — and that is all. It knows nothing about
 * ratings, the LLM or the database: that logic lives in
 * IncomingMessageHandler in one copy, rather than being duplicated in every
 * implementation.
 *
 * So adding Vonage means one new class and one line in the factory.
 */
export interface ISmsProvider {
  /**
   * Parses the raw webhook body. Throws when the payload does not match the
   * expected format — that is an integration error, not a routine outcome.
   */
  parseIncoming(payload: unknown): IncomingSms;

  sendMessage(to: string, body: string): Promise<void>;
}
