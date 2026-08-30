import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';

import { AppConfigService } from '../../config/app-config.service';
import type { ISmsProvider } from '../sms-provider.interface';

/**
 * Real delivery through Twilio.
 *
 * The REST API rather than TwiML, deliberately: TwiML requires the answer to
 * be in the body of the HTTP response to the webhook, which means waiting for
 * the LLM before replying to the provider. Twilio allows 15 seconds for that
 * and retries beyond it. A REST call breaks the coupling — the webhook is
 * acknowledged immediately and the reply goes out separately once ready.
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

  async sendMessage(to: string, body: string): Promise<void> {
    const message = await this.client.messages.create({
      to,
      from: this.fromNumber,
      body,
    });

    this.logger.log(`Sent ${message.sid} to ${to}`);
  }
}
