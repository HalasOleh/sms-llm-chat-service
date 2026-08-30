import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Conversation } from './conversation.entity';
import { ConversationRepository } from './conversation.repository';
import { CONVERSATION_REPOSITORY } from './conversation.repository.interface';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation])],
  providers: [
    ConversationsService,
    // Binding the interface to a concrete implementation happens here and
    // only here — consumers know nothing but CONVERSATION_REPOSITORY.
    { provide: CONVERSATION_REPOSITORY, useClass: ConversationRepository },
  ],
  exports: [ConversationsService],
})
export class ConversationsModule {}
