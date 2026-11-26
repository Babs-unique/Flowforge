import { environmentSchema, validateEnvironment } from './env.validation.js';

describe('environment configuration', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://user:password@localhost:5432/flowforge',
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
});
