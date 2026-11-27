import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { ACCESS_COOKIE_NAME } from '../auth.cookies.js';
import { AccessTokenGuard } from './access-token.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const ACCESS_SECRET = 'guard-access-secret-that-is-at-least-32-bytes';

describe('AccessTokenGuard', () => {
  let moduleRef: TestingModule;
  let jwt: JwtService;
  let guard: AccessTokenGuard;
  const findSession = vi.fn();

  beforeEach(async () => {
    findSession.mockReset();
    moduleRef = await Test.createTestingModule({
      providers: [
        AccessTokenGuard,
        { provide: JwtService, useValue: new JwtService({}) },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => ACCESS_SECRET },
        },
        {
          provide: PrismaService,
          useValue: { authSession: { findFirst: findSession } },
        },
      ],
    }).compile();
    jwt = moduleRef.get(JwtService);
    guard = moduleRef.get(AccessTokenGuard);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('authenticates only an active access-cookie session and sets a typed request user', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Flow User',
    };
    findSession.mockResolvedValue({ id: 'session-id', user });
    const token = await jwt.signAsync(
      { sub: user.id, sid: 'session-id', tokenUse: 'access' },
      {
        secret: ACCESS_SECRET,
        expiresIn: 60,
        issuer: 'flowforge',
        audience: 'flowforge-api',
        algorithm: 'HS256',
      },
    );
    const request = {
      cookies: { [ACCESS_COOKIE_NAME]: token },
    } as unknown as AuthenticatedRequest;

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.user).toEqual({ ...user, sessionId: 'session-id' });
  });

  it('rejects bearer tokens and missing cookies', async () => {
    const request = {
      headers: { authorization: 'Bearer ignored-token' },
      cookies: {},
    } as unknown as AuthenticatedRequest;

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findSession).not.toHaveBeenCalled();
  });

  it('rejects sessions that are missing, expired, or revoked in PostgreSQL', async () => {
    findSession.mockResolvedValue(null);
    const token = await jwt.signAsync(
      { sub: 'user-id', sid: 'session-id', tokenUse: 'access' },
      {
        secret: ACCESS_SECRET,
        expiresIn: 60,
        issuer: 'flowforge',
        audience: 'flowforge-api',
        algorithm: 'HS256',
      },
    );
    const request = {
      cookies: { [ACCESS_COOKIE_NAME]: token },
    } as unknown as AuthenticatedRequest;

    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function createContext(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
