import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ConversationStatus {
  Received = 'RECEIVED',
  ResponseGenerated = 'RESPONSE_GENERATED',
  Completed = 'COMPLETED',
  Failed = 'FAILED',
}

export enum Feedback {
  Positive = 'POSITIVE',
  Negative = 'NEGATIVE',
  None = 'NONE',
}

/**
 * One "incoming message → generated reply" pair.
 *
 * Deliberately a flat model, with no separate tables for messages and
 * ratings: the relation is 1:1, so separate entities would add joins and no
 * new capability. Once multi-turn dialogue is needed this splits into
 * Conversation + Message (noted in the README).
 */
@Entity('conversations')
// Serves both queries: the admin lookup by number, and finding the latest
// completed conversation when feedback arrives.
@Index(['phoneNumber', 'createdAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Always E.164 — normalized on the way in, so a lookup by number does not
   * depend on how the provider or the admin happened to write it.
   */
  @Column({ type: 'varchar', length: 32 })
  phoneNumber!: string;

  @Column({ type: 'text' })
  incomingMessage!: string;

  @Column({ type: 'text', nullable: true })
  llmResponse!: string | null;

  /**
   * The idempotency key. Twilio retries a webhook up to 5 times, so the same
   * MessageSid arriving twice is entirely expected — unique turns that into a
   * database conflict instead of a second LLM call and a second SMS.
   */
  @Column({ type: 'varchar', length: 128, unique: true })
  providerMessageId!: string;

  /** The provider's own timestamp, kept apart from the row's creation time. */
  @Column({ type: 'timestamptz', nullable: true })
  providerTimestamp!: Date | null;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.Received,
  })
  status!: ConversationStatus;

  @Column({ type: 'enum', enum: Feedback, default: Feedback.None })
  feedback!: Feedback;

  /** Reserved for the delivery status callback (out of scope here). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  deliveryStatus!: string | null;

  /**
   * The error text when processing failed, so a FAILED row can be
   * investigated without digging through logs.
   */
  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
