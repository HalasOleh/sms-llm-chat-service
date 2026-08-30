import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

import { AppConfigService } from '../../config/app-config.service';
import {
  LlmGenerationError,
  type ILlmProvider,
} from '../llm-provider.interface';

/**
 * The real language model.
 *
 * The system prompt asks for short answers because this is SMS. But a prompt
 * is only a request: the guarantee comes from truncateForSms after
 * generation.
 *
 * The timeout is set explicitly and deliberately low. The call happens after
 * the webhook has been acknowledged, so Twilio's 15 seconds no longer apply —
 * but a customer waiting a minute for an SMS concludes the service is broken.
 */
@Injectable()
export class OpenAiLlmProvider implements ILlmProvider {
  private static readonly SYSTEM_PROMPT = [
    'You are a customer support assistant answering over SMS.',
    'Answer in at most 2 short sentences, under 300 characters.',
    'Use plain text: no markdown, no emoji, no links unless asked.',
    'If you do not know the answer, say so and suggest contacting support.',
  ].join(' ');

  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: AppConfigService) {
    const { apiKey, model, timeoutMs } = config.openai;

    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
    this.model = model;
  }

  async generateReply(message: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        max_completion_tokens: 200,
        messages: [
          { role: 'system', content: OpenAiLlmProvider.SYSTEM_PROMPT },
          { role: 'user', content: message },
        ],
      });

      const reply = completion.choices[0]?.message?.content?.trim();

      // An empty completion is a failure too: there is nothing to send.
      if (!reply) {
        throw new LlmGenerationError('OpenAI returned an empty completion');
      }

      return reply;
    } catch (error) {
      if (error instanceof LlmGenerationError) {
        throw error;
      }

      this.logger.error(
        `OpenAI request failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Wrapped so the handler never sees OpenAI's error types.
      throw new LlmGenerationError('Failed to generate a reply', error);
    }
  }
}
