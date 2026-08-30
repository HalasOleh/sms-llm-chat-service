import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

import { AppConfigService } from '../../config/app-config.service';
import type { IncomingSms, ISmsProvider } from '../sms-provider.interface';

/**
 * The real Twilio integration.
 *
 * Inbound: Twilio posts the webhook as application/x-www-form-urlencoded
 * with From / Body / MessageSid (and DateSent when available).
 *
 * Outbound: the REST API rather than TwiML. The reason is architectural —
 * TwiML requires the answer to be in the body of the HTTP response to the
 * webhook, which means waiting for the LLM before replying to the provider.
 * Twilio allows 15 seconds for that and retries beyond it. A REST call breaks
 * the coupling: the webhook is acknowledged immediately and the reply goes
 * out separately once ready.
 */
@Injectable()
export class TwilioSmsProvider implements ISmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private readonly client: Twilio;
  private readonly fromNumber: string;

  constructor(config: AppConfigService) {
    const { accountSid, authToken, phoneNumber } = config.twilio;

    this.client = new Twilio(accountSid, authToken);
    this.fromNumber = phoneNumber;
  }

  parseIncoming(payload: unknown): IncomingSms {
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

    const rawDate = data?.DateSent;
    const timestamp =
      typeof rawDate === 'string' && !Number.isNaN(Date.parse(rawDate))
        ? new Date(rawDate)
        : null;

    // An empty body is legitimate (an attachment on its own, for instance)
    // and must not break message intake.
    return { from, body: body ?? '', messageId, timestamp };
  }

  async sendMessage(to: string, body: string): Promise<void> {
    const message = await this.client.messages.create({
      to,
      from: this.fromNumber,
      body,
    });

    this.logger.log(`Sent ${message.sid} to ${to}`);
  }
}
