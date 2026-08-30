import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { validateRequest } from 'twilio';

import { AppConfigService } from '../../config/app-config.service';

/**
 * Verifies that a webhook request really came from Twilio.
 *
 * The webhook is a public endpoint: without this check anyone on the internet
 * can burn your LLM and SMS budget. Twilio signs every request with an
 * X-Twilio-Signature header; the signature is computed over the exact public
 * URL and the sorted form fields, which is why TWILIO_WEBHOOK_URL is needed —
 * behind a proxy the URL the app sees is not the URL Twilio signed.
 *
 * Validation uses the official validateRequest(); Twilio explicitly advises
 * against writing your own signature check.
 *
 * When SMS_PROVIDER=mock the guard lets everything through, because local
 * development would otherwise be impossible.
 */
@Injectable()
export class TwilioSignatureGuard implements CanActivate {
  private readonly logger = new Logger(TwilioSignatureGuard.name);

  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.smsProvider !== 'twilio') {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.header('X-Twilio-Signature');

    if (!signature) {
      throw new ForbiddenException('Missing X-Twilio-Signature header');
    }

    const { authToken, webhookUrl } = this.config.twilio;
    const isValid = validateRequest(
      authToken,
      signature,
      webhookUrl,
      (request.body ?? {}) as Record<string, string>,
    );

    if (!isValid) {
      this.logger.warn(`Rejected webhook with invalid signature: ${signature}`);
      throw new ForbiddenException('Invalid Twilio signature');
    }

    return true;
  }
}
