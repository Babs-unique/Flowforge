import { environmentSchema, validateEnvironment } from './env.validation.js';

describe('environment configuration', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/flowforge',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
  };

  it('applies defaults and parses numeric ports', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        PORT: '4000',
      }),
    ).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      JWT_ACCESS_TOKEN_EXPIRATION: 900,
      JWT_REFRESH_TOKEN_EXPIRATION: 2_592_000,
    });
  });

  it('rejects a missing database URL', () => {
    expect(environmentSchema.safeParse({}).success).toBe(false);
  });

  it('rejects invalid URLs and ports', () => {
    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        DATABASE_URL: 'https://localhost/database',
        PORT: 'not-a-port',
      }).success,
    ).toBe(false);
  });

  it('requires Observe credentials as a pair', () => {
    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        OBSERVE_APP_KEY: 'configured-key',
      }).success,
    ).toBe(false);
  });

  it('requires separate strong JWT secrets and trusted production origins', () => {
    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        JWT_REFRESH_SECRET: validEnvironment.JWT_ACCESS_SECRET,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
      }).success,
    ).toBe(false);
    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://app.example.com',
      }).success,
    ).toBe(true);
  });

  it('parses token expiration shorthand into seconds and rejects invalid durations', () => {
    expect(
      validateEnvironment({
        ...validEnvironment,
        JWT_ACCESS_TOKEN_EXPIRATION: '15m',
        JWT_REFRESH_TOKEN_EXPIRATION: '7d',
      }),
    ).toMatchObject({
      JWT_ACCESS_TOKEN_EXPIRATION: 900,
      JWT_REFRESH_TOKEN_EXPIRATION: 604_800,
    });

    expect(
      environmentSchema.safeParse({
        ...validEnvironment,
        JWT_ACCESS_TOKEN_EXPIRATION: '15 minutes',
        JWT_REFRESH_TOKEN_EXPIRATION: '7d',
      }).success,
    ).toBe(false);
  });
});
