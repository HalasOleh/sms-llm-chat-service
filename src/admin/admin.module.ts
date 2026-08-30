import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AppConfigService } from '../config/app-config.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { AdminController } from './admin.controller';
import { AuthService } from './auth/auth.service';
import { RolesGuard } from './auth/guards';
import { JwtStrategy } from './auth/jwt.strategy';

@Module({
  imports: [
    ConversationsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): JwtModuleOptions => ({
        secret: config.jwt.secret,
        signOptions: { expiresIn: config.jwt.expiresInSeconds },
      }),
    }),
  ],
  controllers: [AdminController],
  providers: [AuthService, JwtStrategy, RolesGuard],
})
export class AdminModule {}
