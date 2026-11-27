import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

const PASSWORD = 'correct horse battery staple 123';
const ACCESS_SECRET = 'test-access-signing-secret-123456789';
const REFRESH_SECRET = 'test-refresh-signing-secret-123456789';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SessionRow {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createHarness() {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();

  const transaction = {
    user: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<UserRow, 'createdAt' | 'updatedAt'>;
        }) => {
          const user = {
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.set(user.id, user);
          return user;
        },
      ),
    },
    authSession: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: Omit<SessionRow, 'createdAt' | 'updatedAt' | 'revokedAt'>;
        }) => {
          const session = {
            ...data,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          sessions.set(session.id, session);
          return session;
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const session = sessions.get(where.id);
        const user = session ? users.get(session.userId) : undefined;
        return session && user ? { ...session, user } : null;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id?: string;
            userId?: string;
            refreshTokenHash?: string;
            revokedAt?: null;
            expiresAt?: { gt: Date };
          };
          data: Partial<SessionRow>;
        }) => {
          let count = 0;
          for (const session of sessions.values()) {
            if (
              (where.id !== undefined && session.id !== where.id) ||
              (where.userId !== undefined && session.userId !== where.userId) ||
              (where.refreshTokenHash !== undefined &&
                session.refreshTokenHash !== where.refreshTokenHash) ||
              (where.revokedAt === null && session.revokedAt !== null) ||
              (where.expiresAt !== undefined &&
                session.expiresAt <= where.expiresAt.gt)
            ) {
              continue;
            }

            Object.assign(session, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
  };

  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return (
          [...users.values()].find((user) => user.email === where.email) ?? null
        );
      }),
    },
    authSession: transaction.authSession,
    $transaction: vi.fn(
      async <T>(
        callback: (client: typeof transaction) => Promise<T>,
      ): Promise<T> => callback(transaction),
    ),
  };
  const config = {
    getOrThrow: (key: string) =>
      ({
        JWT_ACCESS_SECRET: ACCESS_SECRET,
        JWT_REFRESH_SECRET: REFRESH_SECRET,
        JWT_ACCESS_TOKEN_EXPIRATION: 900,
        JWT_REFRESH_TOKEN_EXPIRATION: 604_800,
      })[key],
  };

  return { prisma, config, users, sessions, transaction };
}

describe('AuthService', () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  let harness: ReturnType<typeof createHarness>;

  beforeEach(async () => {
    harness = createHarness();
    moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: harness.prisma },
        { provide: JwtService, useValue: new JwtService({}) },
        { provide: ConfigService, useValue: harness.config },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('registers with an Argon2id hash and persists only a refresh-token digest', async () => {
    const result = await service.register(
      'User@Example.com',
      PASSWORD,
      'Flow User',
    );
    const user = [...harness.users.values()][0];
    const session = [...harness.sessions.values()][0];

    expect(result.user).toEqual({
      id: user.id,
      email: 'user@example.com',
      name: 'Flow User',
    });
    expect(await argon2.verify(user.passwordHash!, PASSWORD)).toBe(true);
    expect(session.refreshTokenHash).not.toBe(result.tokens.refreshToken);
    expect(session.refreshTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session.userAgent).toBeUndefined();
  });

  it('maps a duplicate email constraint to a conflict', async () => {
    harness.transaction.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Duplicate email', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.register('user@example.com', PASSWORD),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts a valid password and rejects an invalid or unknown login identically', async () => {
    const registered = await service.register('user@example.com', PASSWORD);

    const login = await service.login('user@example.com', PASSWORD);
    expect(login.user).toEqual(registered.user);
    expect(login.user).not.toHaveProperty('passwordHash');
    await expect(
      service.login('user@example.com', 'incorrect password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login('unknown@example.com', PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates a valid refresh token and stores only the new digest', async () => {
    const registered = await service.register('user@example.com', PASSWORD);
    const session = [...harness.sessions.values()][0];
    const oldHash = session.refreshTokenHash;

    const refreshed = await service.refresh(registered.tokens.refreshToken);

    expect(refreshed.tokens.refreshToken).not.toBe(
      registered.tokens.refreshToken,
    );
    expect(session.refreshTokenHash).not.toBe(oldHash);
    expect(session.refreshTokenHash).not.toBe(refreshed.tokens.refreshToken);
    expect(refreshed.user).toEqual(registered.user);
  });

  it.each(['expired', 'revoked'] as const)(
    'rejects a %s session',
    async (state) => {
      const registered = await service.register('user@example.com', PASSWORD);
      const session = [...harness.sessions.values()][0];
      if (state === 'expired') {
        session.expiresAt = new Date(Date.now() - 1_000);
      } else {
        session.revokedAt = new Date();
      }

      await expect(
        service.refresh(registered.tokens.refreshToken),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );

  it('detects refresh-token reuse and revokes the associated session', async () => {
    const registered = await service.register('user@example.com', PASSWORD);
    const session = [...harness.sessions.values()][0];
    session.refreshTokenHash = 'f'.repeat(64);

    await expect(
      service.refresh(registered.tokens.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it('allows only one concurrent refresh and revokes the session after reuse is detected', async () => {
    const registered = await service.register('user@example.com', PASSWORD);

    const results = await Promise.allSettled([
      service.refresh(registered.tokens.refreshToken),
      service.refresh(registered.tokens.refreshToken),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect([...harness.sessions.values()][0].revokedAt).toBeInstanceOf(Date);
  });

  it('revokes one session or every active session on logout', async () => {
    const first = await service.register('user@example.com', PASSWORD);
    const second = await service.login('user@example.com', PASSWORD);
    const sessions = [...harness.sessions.values()];
    const currentUser: AuthenticatedUser = {
      ...first.user,
      sessionId: sessions[0].id,
    };

    await service.logoutCurrentSession(currentUser);
    expect(sessions[0].revokedAt).toBeInstanceOf(Date);
    expect(sessions[1].revokedAt).toBeNull();

    await service.logoutAllSessions(second.user.id);
    expect(sessions.every((session) => session.revokedAt instanceof Date)).toBe(
      true,
    );
  });
});
