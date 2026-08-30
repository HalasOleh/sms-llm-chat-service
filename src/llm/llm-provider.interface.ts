export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/**
 * The language model contract, reduced to a single question: "here is the
 * customer's message — what should we answer?".
 *
 * Deliberately without dialogue history in the signature. Adding it would
 * mean passing context that nothing currently collects, and pretending the
 * capability exists. When conversation memory arrives, a second parameter
 * appears here — and this is the only place the change touches.
 *
 * Implementations must not throw as-is: any provider failure arrives here as
 * an LlmGenerationError, so the handler never has to reason about
 * OpenAI-specific error types.
 */
export interface ILlmProvider {
  generateReply(message: string): Promise<string>;
}

export class LlmGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmGenerationError';
  }
}
