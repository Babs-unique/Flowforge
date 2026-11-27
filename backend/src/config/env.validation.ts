import { z } from 'zod';

const optionalPort = z.coerce.number().int().min(1).max(65535).optional();
const jwtSecret = z
  .string()
  .refine((value) => Buffer.byteLength(value, 'utf8') >= 32, {
    message: 'must be at least 32 bytes',
  });
const tokenExpiration = (fallback: string, minimum: number, maximum: number) =>
  z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'must be a duration such as 15m or 7d')
    .default(fallback)
    .transform(parseDurationSeconds)
    .pipe(z.number().int().min(minimum).max(maximum));
const corsOrigins = z
  .string()
  .optional()
  .transform(
    (value) =>
      value
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [],
  )
  .pipe(
    z.array(
      z
        .string()
        .url()
        .refine((origin) => {
          const parsed = new URL(origin);
          return (
            ['http:', 'https:'].includes(parsed.protocol) &&
            parsed.origin === origin &&
            !origin.includes('*')
          );
        }, 'must be an exact HTTP(S) origin without a wildcard'),
    ),
  );
const cookieDomain = z
  .string()
  .trim()
  .min(1)
  .refine((domain) => {
    try {
      const parsed = new URL(`http://${domain}`);
      return (
        parsed.hostname === domain &&
        parsed.port === '' &&
        parsed.pathname === '/'
      );
    } catch {
      return false;
    }
  }, 'must be a hostname without a scheme, port, or path');

export const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'production', 'test'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) =>
          ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
        {
          message: 'must be a valid PostgreSQL connection URL',
        },
      ),
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
    JWT_ACCESS_SECRET: jwtSecret,
    JWT_REFRESH_SECRET: jwtSecret,
    JWT_ACCESS_TOKEN_EXPIRATION: tokenExpiration('15m', 60, 3600),
    JWT_REFRESH_TOKEN_EXPIRATION: tokenExpiration('30d', 3600, 7_776_000),
    COOKIE_DOMAIN: cookieDomain.optional(),
    COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
    CORS_ORIGINS: corsOrigins,
  })
  .superRefine((env, context) => {
    if (Boolean(env.OBSERVE_APP_KEY) !== Boolean(env.OBSERVE_APP_SECRET)) {
      context.addIssue({
        code: 'custom',
        path: ['OBSERVE_APP_KEY'],
        message: 'OBSERVE_APP_KEY and OBSERVE_APP_SECRET must be set together',
      });
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'must differ from JWT_ACCESS_SECRET',
      });
    }

    if (env.JWT_REFRESH_TOKEN_EXPIRATION <= env.JWT_ACCESS_TOKEN_EXPIRATION) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_TOKEN_EXPIRATION'],
        message: 'must be longer than JWT_ACCESS_TOKEN_EXPIRATION',
      });
    }

    if (env.COOKIE_SAME_SITE === 'none' && env.NODE_ENV !== 'production') {
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SAME_SITE'],
        message: 'none requires production Secure cookies',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.CORS_ORIGINS.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: 'at least one trusted origin is required in production',
        });
      }

      env.CORS_ORIGINS.forEach((origin, index) => {
        if (new URL(origin).protocol !== 'https:') {
          context.addIssue({
            code: 'custom',
            path: ['CORS_ORIGINS', index],
            message: 'production origins must use HTTPS',
          });
        }
      });
    }
  });

export function validateEnvironment(environment: Record<string, unknown>) {
  return environmentSchema.parse(environment);
}

function parseDurationSeconds(value: string): number {
  const match = /^([1-9]\d*)([smhd])$/.exec(value);
  if (!match) {
    return Number.NaN;
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3600;
    case 'd':
      return amount * 86_400;
    default:
      return Number.NaN;
  }
}
