import { Module } from '@nestjs/common';

import { ConversationsModule } from '../conversations/conversations.module';
import { LlmModule } from '../llm/llm.module';
import { SmsModule } from '../sms/sms.module';
import { IncomingMessageHandler } from './incoming-message.handler';

@Module({
  imports: [ConversationsModule, LlmModule, SmsModule],
  providers: [IncomingMessageHandler],
})
export class MessagingModule {}
