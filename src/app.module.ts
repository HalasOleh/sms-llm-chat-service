import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AdminModule } from './admin/admin.module';
import { AppConfigModule } from './config/app-config.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LlmModule } from './llm/llm.module';
import { MessagingModule } from './messaging/messaging.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    // In-process bus: it decouples processing from the webhook's HTTP
    // response without pulling in external infrastructure. The accepted
    // consequence is that a message is lost if the process dies between the
    // acknowledgement and the send; production would put a durable queue
    // here (see README).
    EventEmitterModule.forRoot(),
    ConversationsModule,
    LlmModule,
    SmsModule,
    MessagingModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
