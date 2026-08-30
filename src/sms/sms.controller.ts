import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { normalizePhoneNumber } from '../common/phone.util';
import {
  SMS_RECEIVED,
  type SmsReceivedEvent,
} from '../messaging/events/sms-received.event';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { SMS_PROVIDER, type ISmsProvider } from './sms-provider.interface';

/**
 * Intake of incoming SMS.
 *
 * The controller does exactly four things: verify the signature, parse the
 * payload, normalize the number and publish an event. It knows nothing about
 * the language model or the database, which is why replacing the in-process
 * bus with a real queue would not touch a line here.
 *
 * It answers 204 immediately, without waiting for processing. That is not an
 * optimization but a constraint of the channel: Twilio allows 15 seconds for
 * the whole response and retries beyond that, and an LLM call does not
 * reliably fit in that budget. Waiting for the model here would mean
 * duplicate SMS to the customer on every latency spike.
 */
@Controller('webhook/sms')
@UseGuards(TwilioSignatureGuard)
export class SmsController {
  constructor(
    @Inject(SMS_PROVIDER) private readonly provider: ISmsProvider,
    private readonly events: EventEmitter2,
  ) {}

  /** The generic JSON format — for local development and tests. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  receive(@Body() payload: unknown): void {
    this.accept(payload);
  }

  /**
   * The Twilio format (form-encoded). A route of its own, because this is the
   * path you configure in the Twilio console; the parsing inside is done by
   * the same provider.
   */
  @Post('twilio')
  @HttpCode(HttpStatus.NO_CONTENT)
  receiveFromTwilio(@Body() payload: unknown): void {
    this.accept(payload);
  }

  private accept(payload: unknown): void {
    const incoming = this.provider.parseIncoming(payload);

    const event: SmsReceivedEvent = {
      phoneNumber: normalizePhoneNumber(incoming.from),
      body: incoming.body,
      providerMessageId: incoming.messageId,
      providerTimestamp: incoming.timestamp,
    };

    // emit, not emitAsync: awaiting listeners would bring the model's latency
    // right back into the response this whole design exists to protect.
    this.events.emit(SMS_RECEIVED, event);
  }
}
