import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { truncateForSms } from '../common/text.util';
import { AppConfigService } from '../config/app-config.service';
import { ConversationsService } from '../conversations/conversations.service';
import { LLM_PROVIDER, type ILlmProvider } from '../llm/llm-provider.interface';
import { SMS_PROVIDER, type ISmsProvider } from '../sms/sms-provider.interface';
import {
  SMS_RECEIVED,
  type SmsReceivedEvent,
} from './events/sms-received.event';
import { parseFeedback } from './feedback-parser';

/**
 * The one place where the incoming-message business flow lives.
 *
 * It runs AFTER the webhook has been acknowledged (see SmsController), so no
 * error from here can turn into an HTTP response to the provider — that
 * response is already sent. Hence the approach to failures: every external
 * call is wrapped individually, and the conversation stays in the database
 * with a status showing exactly which step stopped.
 */
@Injectable()
export class IncomingMessageHandler {
  private static readonly FALLBACK_REPLY =
    'Sorry, we could not process your message right now. Please try again later.';

  private readonly logger = new Logger(IncomingMessageHandler.name);

  constructor(
    private readonly conversations: ConversationsService,
    private readonly config: AppConfigService,
    @Inject(SMS_PROVIDER) private readonly sms: ISmsProvider,
    @Inject(LLM_PROVIDER) private readonly llm: ILlmProvider,
  ) {}

  @OnEvent(SMS_RECEIVED, { async: true })
  async handle(event: SmsReceivedEvent): Promise<void> {
    try {
      await this.process(event);
    } catch (error) {
      // Last line of defence: an unhandled error here would otherwise become
      // an unhandled rejection and take the process down.
      this.logger.error(
        `Unhandled failure for ${event.providerMessageId}: ${this.describe(error)}`,
      );
    }
  }

  private async process(event: SmsReceivedEvent): Promise<void> {
    // 1. Feedback is handled first: it creates no conversation, calls no
    //    model and sends nothing back — otherwise the customer and the
    //    service would acknowledge each other's acknowledgements forever.
    const feedback = parseFeedback(event.body);

    if (feedback) {
      const recorded = await this.conversations.recordFeedback(
        event.phoneNumber,
        feedback,
      );

      this.logger.log(
        recorded
          ? `Recorded ${feedback} feedback for ${event.phoneNumber}`
          : `Ignored ${feedback} feedback for ${event.phoneNumber}: no completed conversation`,
      );
      return;
    }

    // 2. Idempotency: a webhook retry must not cause a second model call or a
    //    second SMS to the customer.
    const conversation = await this.conversations.startConversation({
      phoneNumber: event.phoneNumber,
      incomingMessage: event.body,
      providerMessageId: event.providerMessageId,
      providerTimestamp: event.providerTimestamp,
    });

    if (!conversation) {
      this.logger.log(
        `Skipped duplicate delivery of ${event.providerMessageId}`,
      );
      return;
    }

    // 3. Generation. A model failure does not leave the customer with nothing:
    //    they get an honest "try again later", while the conversation goes to
    //    FAILED with the error text for investigation.
    let reply: string;
    let generationFailed = false;

    try {
      reply = await this.llm.generateReply(event.body);
      await this.conversations.attachLlmResponse(conversation.id, reply);
    } catch (error) {
      generationFailed = true;
      reply = IncomingMessageHandler.FALLBACK_REPLY;

      this.logger.error(
        `LLM failed for ${conversation.id}: ${this.describe(error)}`,
      );
      await this.conversations.markFailed(
        conversation.id,
        this.describe(error),
      );
    }

    // 4. Delivery. The length limit is the guarantee against a bill for a
    //    dozen segments when the model ignores the request to be brief.
    try {
      await this.sms.sendMessage(
        event.phoneNumber,
        truncateForSms(reply, this.config.smsMaxLength),
      );

      // Only a conversation with a real answer counts as completed —
      // otherwise a later 👍 would attach itself to an apology.
      if (!generationFailed) {
        await this.conversations.markCompleted(conversation.id);
      }
    } catch (error) {
      this.logger.error(
        `SMS delivery failed for ${conversation.id}: ${this.describe(error)}`,
      );
      await this.conversations.markFailed(
        conversation.id,
        this.describe(error),
      );
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
