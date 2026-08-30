import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Conversation, ConversationStatus } from './conversation.entity';
import type {
  CreateConversationInput,
  IConversationRepository,
} from './conversation.repository.interface';

/** PostgreSQL code for a unique constraint violation. */
const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ConversationRepository implements IConversationRepository {
  constructor(
    @InjectRepository(Conversation)
    private readonly repository: Repository<Conversation>,
  ) {}

  /**
   * Inserts and catches the conflict, rather than checking for existence
   * first.
   *
   * A check-then-insert here would be a textbook race: two concurrent Twilio
   * retries would both pass the check and create two rows. The unique
   * constraint is the only place where this decision is actually atomic.
   */
  async createIfNotExists(
    input: CreateConversationInput,
  ): Promise<Conversation | null> {
    try {
      return await this.repository.save(this.repository.create(input));
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  async update(id: string, changes: Partial<Conversation>): Promise<void> {
    await this.repository.update({ id }, changes);
  }

  async findLatestCompletedByPhone(
    phoneNumber: string,
  ): Promise<Conversation | null> {
    return this.repository.findOne({
      where: { phoneNumber, status: ConversationStatus.Completed },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllByPhone(phoneNumber: string): Promise<Conversation[]> {
    return this.repository.find({
      where: { phoneNumber },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.repository.findOne({ where: { id } });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code ===
        PG_UNIQUE_VIOLATION
    );
  }
}
