import { z } from 'zod';

const optionalPort = z.coerce.number().int().min(1).max(65535).optional();

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol), {
        message: 'must be a valid PostgreSQL connection URL',
      }),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: optionalPort,
    DB_USER: z.string().min(1).optional(),
    DB_PASSWORD: z.string().min(1).optional(),
    DB_NAME: z.string().min(1).optional(),
    REDIS_HOST: z.string().min(1).optional(),
    REDIS_PORT: optionalPort,
    REDIS_PASSWORD: z.string().min(1).optional(),
    OBSERVE_APP_KEY: z.string().trim().min(1).optional(),
    OBSERVE_APP_SECRET: z.string().trim().min(1).optional(),
  })
  .superRefine((env, context) => {
    if (Boolean(env.OBSERVE_APP_KEY) !== Boolean(env.OBSERVE_APP_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['OBSERVE_APP_KEY'],
        message: 'OBSERVE_APP_KEY and OBSERVE_APP_SECRET must be set together',
      });
    }
  });

export function validateEnvironment(environment: Record<string, unknown>) {
  return environmentSchema.parse(environment);
}
