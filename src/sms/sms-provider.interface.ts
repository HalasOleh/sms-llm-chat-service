export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** An incoming message in a shape that no longer depends on the provider. */
export interface IncomingSms {
  from: string;
  body: string;
  messageId: string;
  timestamp: Date | null;
}

/**
 * The SMS provider contract: sending only.
 *
 * Parsing incoming webhooks deliberately lives in parsers/ — the payload
 * format is decided by the route, not by who sends the replies. That keeps
 * this interface down to a single method: adding Vonage means a class with
 * one sendMessage and a line in the factory, with no obligation to implement
 * anyone else's parsing.
 *
 * A provider knows nothing about ratings, the LLM or the database — that
 * logic lives in IncomingMessageHandler, in one copy.
 */
export interface ISmsProvider {
  sendMessage(to: string, body: string): Promise<void>;
}
