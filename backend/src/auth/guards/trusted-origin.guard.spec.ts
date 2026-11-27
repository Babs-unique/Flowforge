import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { TrustedOriginGuard } from './trusted-origin.guard.js';

describe('TrustedOriginGuard', () => {
  const guard = createGuard('production');

  it('allows state-changing requests from a configured origin', () => {
    const request = createRequest('POST', 'https://app.flowforge.example');
    expect(guard.canActivate(createContext(request))).toBe(true);
  });

  it.each([undefined, 'https://attacker.example'])(
    'rejects state-changing requests with origin %s',
    (origin) => {
      expect(() =>
        guard.canActivate(createContext(createRequest('POST', origin))),
      ).toThrow(ForbiddenException);
    },
  );

  it('allows safe reads without an Origin header', () => {
    expect(
      guard.canActivate(createContext(createRequest('GET', undefined))),
    ).toBe(true);
  });

  it('allows state-changing requests without an Origin header in development', () => {
    const developmentGuard = createGuard('development');

    expect(
      developmentGuard.canActivate(createContext(createRequest('POST', undefined))),
    ).toBe(true);
  });
});

function createGuard(nodeEnv: string): TrustedOriginGuard {
  return new TrustedOriginGuard({
    getOrThrow: (key: string) =>
      key === 'NODE_ENV' ? nodeEnv : ['https://app.flowforge.example'],
  } as unknown as ConfigService);
}

function createRequest(method: string, origin: string | undefined): Request {
  return {
    method,
    get: (name: string) =>
      name.toLowerCase() === 'origin' ? origin : undefined,
  } as unknown as Request;
}

function createContext(request: Request): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
