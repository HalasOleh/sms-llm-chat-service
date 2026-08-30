import type {
  Conversation,
  ConversationStatus,
  Feedback,
} from './conversation.entity';

/**
 * The boundary between business logic and storage.
 *
 * Services and the message handler depend on this interface rather than on
 * TypeORM, so replacing the ORM (or moving to a different store entirely)
 * touches no business logic. This boundary has already paid for itself once:
 * the persistence layer moved from Prisma to TypeORM without changes
 * elsewhere.
 */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

export interface CreateConversationInput {
  phoneNumber: string;
  incomingMessage: string;
  providerMessageId: string;
  providerTimestamp: Date | null;
}

export interface IConversationRepository {
  /**
   * Creates a conversation, or reports that a message with this
   * providerMessageId has already been processed.
   *
   * Returns `null` instead of throwing — a duplicate from a webhook retry is
   * an expected, ordinary outcome, not an exceptional one.
   */
  createIfNotExists(
    input: CreateConversationInput,
  ): Promise<Conversation | null>;

  update(
    id: string,
    changes: Partial<
      Pick<
        Conversation,
        | 'llmResponse'
        | 'status'
        | 'feedback'
        | 'errorMessage'
        | 'deliveryStatus'
      >
    >,
  ): Promise<void>;

  /** The latest answered conversation — the target for a feedback rating. */
  findLatestCompletedByPhone(phoneNumber: string): Promise<Conversation | null>;

  /** History for the admin, newest first. */
  findAllByPhone(phoneNumber: string): Promise<Conversation[]>;

  findById(id: string): Promise<Conversation | null>;
}

export type { Conversation, ConversationStatus, Feedback };
