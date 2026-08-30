import { Module } from '@nestjs/common';

import { AppConfigService } from '../config/app-config.service';
import { LLM_PROVIDER, type ILlmProvider } from './llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';

/**
 * The same selection pattern as SmsModule — intentionally identical, so that
 * "how do I add another provider" is learned once and applies to both
 * subsystems.
 */
@Module({
  providers: [
    MockLlmProvider,
    {
      provide: LLM_PROVIDER,
      inject: [AppConfigService, MockLlmProvider],
      useFactory: (
        config: AppConfigService,
        mock: MockLlmProvider,
      ): ILlmProvider =>
        config.llmProvider === 'openai' ? new OpenAiLlmProvider(config) : mock,
    },
  ],
  exports: [LLM_PROVIDER, MockLlmProvider],
})
export class LlmModule {}
