import type { AppConfigService } from '../config/app-config.service';
import { LlmGenerationError } from './llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';
import { OpenAiLlmProvider } from './providers/openai-llm.provider';

describe('MockLlmProvider', () => {
  const provider = new MockLlmProvider();

  it('answers deterministically — the flow tests depend on it', async () => {
    const first = await provider.generateReply('How do I reset my password?');
    const second = await provider.generateReply('How do I reset my password?');

    expect(first).toBe(second);
    expect(first).toContain('Forgot password');
  });

  it('recognises the topic regardless of case', async () => {
    const reply = await provider.generateReply('I NEED A REFUND PLEASE');

    expect(reply).toContain('Refunds');
  });

  it('has an answer even for an unexpected question', async () => {
    const reply = await provider.generateReply(
      'what is the airspeed of a swallow',
    );

    expect(reply.length).toBeGreaterThan(0);
  });
});

describe('OpenAiLlmProvider', () => {
  const config = {
    openai: { apiKey: 'sk-test', model: 'gpt-4o-mini', timeoutMs: 1000 },
  } as AppConfigService;

  const providerWithCompletion = (create: jest.Mock): OpenAiLlmProvider => {
    const provider = new OpenAiLlmProvider(config);

    // The network layer is replaced: tests must not call anyone's API.
    (
      provider as unknown as {
        client: { chat: { completions: { create: jest.Mock } } };
      }
    ).client = { chat: { completions: { create } } };

    return provider;
  };

  it("returns the model's answer text", async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '  Reset it from the login page.  ' } }],
    });

    const reply = await providerWithCompletion(create).generateReply('help');

    expect(reply).toBe('Reset it from the login page.');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('converts a provider failure into LlmGenerationError', async () => {
    const create = jest.fn().mockRejectedValue(new Error('503 upstream'));

    await expect(
      providerWithCompletion(create).generateReply('help'),
    ).rejects.toBeInstanceOf(LlmGenerationError);
  });

  it('treats an empty completion as a failure — nothing to send', async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: '   ' } }],
    });

    await expect(
      providerWithCompletion(create).generateReply('help'),
    ).rejects.toBeInstanceOf(LlmGenerationError);
  });
});
