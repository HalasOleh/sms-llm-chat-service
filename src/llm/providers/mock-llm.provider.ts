import { Injectable } from '@nestjs/common';

import type { ILlmProvider } from '../llm-provider.interface';

interface Rule {
  readonly keywords: readonly string[];
  readonly reply: string;
}

/**
 * A deterministic stand-in for the language model.
 *
 * Determinism here is a requirement, not a shortcut: the flow tests depend on
 * it. A real model answers the same question differently every time, so
 * asserting on "what the customer received" is only possible against
 * predictable replies.
 *
 * Several rules instead of a single echo, so the demo reads like a support
 * conversation rather than a mirror.
 */
@Injectable()
export class MockLlmProvider implements ILlmProvider {
  private static readonly RULES: readonly Rule[] = [
    {
      keywords: ['password', 'reset', 'login', 'sign in'],
      reply:
        "You can reset your password by clicking 'Forgot password' on the login page.",
    },
    {
      keywords: ['refund', 'money back', 'cancel'],
      reply:
        'Refunds are processed within 5 business days. Reply with your order number to start one.',
    },
    {
      keywords: ['hours', 'open', 'support', 'contact'],
      reply: 'Our support team is available Monday to Friday, 9:00-18:00 CET.',
    },
    {
      keywords: ['shipping', 'delivery', 'track', 'order'],
      reply:
        'Standard delivery takes 3-5 business days. You can track your order in the app.',
    },
  ];

  private static readonly FALLBACK =
    'Thanks for your message. Our team will get back to you shortly.';

  generateReply(message: string): Promise<string> {
    const normalized = message.toLowerCase();

    const matched = MockLlmProvider.RULES.find((rule) =>
      rule.keywords.some((keyword) => normalized.includes(keyword)),
    );

    return Promise.resolve(matched?.reply ?? MockLlmProvider.FALLBACK);
  }
}
