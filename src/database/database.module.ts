import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfigService } from '../config/app-config.service';
import { Conversation } from '../conversations/conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        type: 'postgres' as const,
        url: config.databaseUrl,
        entities: [Conversation],
        // synchronize is convenient but rewrites the schema silently, which
        // in production is a way to lose data. So it is enabled outside
        // production only, and migrations take over there.
        synchronize: !config.isProduction,
        migrations: [__dirname + '/migrations/*.{ts,js}'],
        migrationsRun: config.isProduction,
        logging: false,
      }),
    }),
  ],
})
export class DatabaseModule {}
