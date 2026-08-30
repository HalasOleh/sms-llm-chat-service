import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from './env.schema';

/**
 * A thin typed wrapper over ConfigService.
 *
 * Not a wrapper for its own sake: the rest of the code gets
 * `config.twilio.accountSid` instead of
 * `configService.get<string>('TWILIO_ACCOUNT_SID')` — no string keys, no
 * `| undefined` where validation already guaranteed a value, and no knowledge
 * of where the configuration came from.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.configService.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get port(): number {
    return this.get('PORT');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get smsProvider(): Env['SMS_PROVIDER'] {
    return this.get('SMS_PROVIDER');
  }

  get llmProvider(): Env['LLM_PROVIDER'] {
    return this.get('LLM_PROVIDER');
  }

  get smsMaxLength(): number {
    return this.get('SMS_MAX_LENGTH');
  }

  /**
   * These values are non-optional by design: if SMS_PROVIDER=twilio, the
   * schema already verified them at startup. This getter is only reached from
   * TwilioSmsProvider, which is not instantiated in any other mode.
   */
  get twilio(): {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
    webhookUrl: string;
  } {
    return {
      accountSid: this.get('TWILIO_ACCOUNT_SID') as string,
      authToken: this.get('TWILIO_AUTH_TOKEN') as string,
      phoneNumber: this.get('TWILIO_PHONE_NUMBER') as string,
      webhookUrl: this.get('TWILIO_WEBHOOK_URL') as string,
    };
  }

  get openai(): { apiKey: string; model: string; timeoutMs: number } {
    return {
      apiKey: this.get('OPENAI_API_KEY') as string,
      model: this.get('LLM_MODEL'),
      timeoutMs: this.get('LLM_TIMEOUT_MS'),
    };
  }

  get admin(): { username: string; passwordHash: string } {
    return {
      username: this.get('ADMIN_USERNAME'),
      passwordHash: this.get('ADMIN_PASSWORD_HASH'),
    };
  }

  get jwt(): { secret: string; expiresInSeconds: number } {
    return {
      secret: this.get('JWT_SECRET'),
      expiresInSeconds: this.get('JWT_EXPIRES_IN_SECONDS'),
    };
  }
}
