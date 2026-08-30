import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/app-config.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AppConfigModule, DatabaseModule, ConversationsModule],
  controllers: [HealthController],
})
export class AppModule {}
