import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import type { IncomingSms, ISmsProvider } from '../sms-provider.interface';

export interface SentMessage {
  to: string;
  body: string;
  sentAt: Date;
}

/**
 * The default provider: it sends nothing anywhere.
 *
 * It exists for two reasons:
 *  - the project boots and works end to end with no external account;
 *  - tests can ask "what exactly did you send the customer" instead of
 *    intercepting HTTP calls.
 *
 * It accepts the generic JSON format from the assignment
 * ({ from, body, messageId, timestamp }).
 */
@Injectable()
export class MockSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  private readonly sent: SentMessage[] = [];

  parseIncoming(payload: unknown): IncomingSms {
    const data = payload as Record<string, unknown> | null;

    const from = typeof data?.from === 'string' ? data.from : null;
    const body = typeof data?.body === 'string' ? data.body : null;
    const messageId =
      typeof data?.messageId === 'string' ? data.messageId : null;

    if (!from || !body || !messageId) {
      throw new BadRequestException(
        'Expected JSON body with "from", "body" and "messageId"',
      );
    }

    const rawTimestamp = data?.timestamp;
    const timestamp =
      typeof rawTimestamp === 'string' &&
      !Number.isNaN(Date.parse(rawTimestamp))
        ? new Date(rawTimestamp)
        : null;

    return { from, body, messageId, timestamp };
  }

  sendMessage(to: string, body: string): Promise<void> {
    this.sent.push({ to, body, sentAt: new Date() });
    this.logger.log(`[mock] → ${to}: ${body}`);
    return Promise.resolve();
  }

  /** For tests and local debugging. */
  getSentMessages(): readonly SentMessage[] {
    return this.sent;
  }

  getLastMessageTo(to: string): SentMessage | undefined {
    return [...this.sent].reverse().find((message) => message.to === to);
  }

  reset(): void {
    this.sent.length = 0;
  }
}
