import { Inject, Injectable } from '@nestjs/common';

import { ConversationStatus, Feedback } from './conversation.entity';
import {
  CONVERSATION_REPOSITORY,
  type Conversation,
  type CreateConversationInput,
  type IConversationRepository,
} from './conversation.repository.interface';

/**
 * Conversation operations expressed in the language of the domain.
 *
 * The rest of the code says "attach the reply" / "mark it failed" rather than
 * "set the status column to FAILED", which keeps statuses and the transitions
 * between them in one place instead of scattering them across the handler and
 * the controllers.
 */
@Injectable()
export class ConversationsService {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly repository: IConversationRepository,
  ) {}

  /** `null` means "this message has already been processed" (webhook retry). */
  async startConversation(
    input: CreateConversationInput,
  ): Promise<Conversation | null> {
    return this.repository.createIfNotExists(input);
  }

  async attachLlmResponse(id: string, llmResponse: string): Promise<void> {
    await this.repository.update(id, {
      llmResponse,
      status: ConversationStatus.ResponseGenerated,
    });
  }

  async markCompleted(id: string): Promise<void> {
    await this.repository.update(id, { status: ConversationStatus.Completed });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.repository.update(id, {
      status: ConversationStatus.Failed,
      errorMessage,
    });
  }

  /**
   * Records a rating against the latest completed conversation for a number.
   * `false` means there was nothing to rate (the customer sent 👍 first).
   */
  async recordFeedback(
    phoneNumber: string,
    feedback: Feedback,
  ): Promise<boolean> {
    const conversation =
      await this.repository.findLatestCompletedByPhone(phoneNumber);

    if (!conversation) {
      return false;
    }

    await this.repository.update(conversation.id, { feedback });
    return true;
  }

  async findByPhone(phoneNumber: string): Promise<Conversation[]> {
    return this.repository.findAllByPhone(phoneNumber);
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.repository.findById(id);
  }
}
