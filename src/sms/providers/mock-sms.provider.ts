import { Injectable, Logger } from '@nestjs/common';

import type { ISmsProvider } from '../sms-provider.interface';

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
 */
@Injectable()
export class MockSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(MockSmsProvider.name);
  private readonly sent: SentMessage[] = [];

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
