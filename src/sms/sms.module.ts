import { Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { SMS_PROVIDER, type ISmsProvider } from './sms-provider.interface';

/**
 * The single place that decides which provider comes up.
 *
 * MockSmsProvider is registered as a class provider of its own (not only
 * under the token) so tests can reach that exact instance and ask it what was
 * sent.
 */
@Module({
  providers: [
    MockSmsProvider,
    TwilioSignatureGuard,
    {
      provide: SMS_PROVIDER,
      inject: [AppConfigService, MockSmsProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockSmsProvider,
      ): ISmsProvider =>
        config.smsProvider === 'twilio' ? new TwilioSmsProvider(config) : mock,
    },
  ],
  exports: [SMS_PROVIDER, MockSmsProvider, TwilioSignatureGuard],
})
export class SmsModule {}
