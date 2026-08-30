import { z } from 'zod';

/**
 * Optional variables are conventionally left declared but empty in .env
 * (`TWILIO_ACCOUNT_SID=`). To the process that is an empty string, not an
 * absent value, so `.optional()` alone does not cover the case — and `.url()`
 * fails on an empty string. Hence this normalization: empty means "not set".
 */
function optional<T extends z.ZodTypeAny>(
  schema: T,
): z.ZodType<z.output<T> | undefined, unknown> {
  return z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    schema.optional(),
  );
}

/**
 * The single source of truth about what the application expects from its
 * environment.
 *
 * Two things matter here:
 *
 * 1. Validation happens at startup — the app either boots with a valid
 *    configuration or does not boot at all. A configuration mistake must not
 *    surface as a 500 on live traffic half an hour later.
 *
 * 2. Which credentials are required depends on the selected provider (see
 *    superRefine below): running without TWILIO_* is only possible while
 *    SMS_PROVIDER=mock. That is the technical expression of the requirement
 *    "works out of the box with no external provider keys".
 */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    SMS_PROVIDER: z.enum(['mock', 'twilio']).default('mock'),
    TWILIO_ACCOUNT_SID: optional(z.string()),
    TWILIO_AUTH_TOKEN: optional(z.string()),
    TWILIO_PHONE_NUMBER: optional(z.string()),
    TWILIO_WEBHOOK_URL: optional(z.url()),

    LLM_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    OPENAI_API_KEY: optional(z.string()),
    LLM_MODEL: z.string().default('gpt-4o-mini'),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

    SMS_MAX_LENGTH: z.coerce.number().int().positive().default(320),

    ADMIN_USERNAME: z.string().min(1, 'ADMIN_USERNAME is required'),
    ADMIN_PASSWORD_HASH: z.string().min(1, 'ADMIN_PASSWORD_HASH is required'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    // In seconds rather than a string like "1h": the jsonwebtoken types expect
    // a narrow literal type that an environment string does not satisfy
    // without a cast. A number is unambiguous and needs no parsing.
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(3600),
  })
  .superRefine((env, ctx) => {
    if (env.SMS_PROVIDER === 'twilio') {
      const required = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_PHONE_NUMBER',
      ] as const;

      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required when SMS_PROVIDER=twilio`,
          });
        }
      }

      // The Twilio signature is computed over the exact URL the request was
      // sent to, so it cannot be verified without knowing that URL.
      if (!env.TWILIO_WEBHOOK_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['TWILIO_WEBHOOK_URL'],
          message:
            'TWILIO_WEBHOOK_URL is required when SMS_PROVIDER=twilio ' +
            '(webhook signature is computed over the exact public URL)',
        });
      }
    }

    if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when LLM_PROVIDER=openai',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Called by ConfigModule at startup. Throws with ALL problems listed at once,
 * rather than one per boot attempt.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
