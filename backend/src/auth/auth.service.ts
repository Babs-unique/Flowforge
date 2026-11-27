import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  AuthenticatedUser,
  PublicUser,
} from './types/authenticated-user.js';
import {
  isTokenClaims,
  type AuthTokens,
  type TokenClaims,
} from './types/auth-tokens.js';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(
    email: string,
    password: string,
    name?: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const userId = randomUUID();
    const sessionId = randomUUID();
    const now = new Date();
    const refreshExpiresAt = this.refreshExpiry(now);
    const [passwordHash, tokens] = await Promise.all([
      argon2.hash(password, ARGON_OPTIONS),
      this.issueTokens(userId, sessionId, refreshExpiresAt),
    ]);

    try {
      const user = await this.prisma.$transaction(async (transaction) => {
        const createdUser = await transaction.user.create({
          data: {
            id: userId,
            email: normalizedEmail,
            passwordHash,
            name: name?.trim() || null,
          },
        });
        await transaction.authSession.create({
          data: {
            id: sessionId,
            userId,
            refreshTokenHash: hashRefreshToken(tokens.refreshToken),
            expiresAt: refreshExpiresAt,
            userAgent: userAgent?.slice(0, 512),
          },
        });
        return createdUser;
      });

      return { user: publicUser(user), tokens };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    const passwordHash =
      user?.passwordHash ?? (await this.getDummyPasswordHash());

    let passwordMatches = false;
    try {
      passwordMatches = await argon2.verify(passwordHash, password);
    } catch {
      passwordMatches = false;
    }

    if (!user || !user.passwordHash || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.createSession(user, userAgent);
  }

  async refresh(refreshToken: string): Promise<AuthResult> {
    const claims = await this.verifyRefreshToken(refreshToken);
    const currentTokenHash = hashRefreshToken(refreshToken);
    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const session = await transaction.authSession.findUnique({
        where: { id: claims.sid },
        include: {
          user: {
            select: { id: true, email: true, name: true },
          },
        },
      });

      if (
        !session ||
        session.userId !== claims.sub ||
        session.revokedAt !== null ||
        session.expiresAt <= now
      ) {
        return { kind: 'invalid' } as const;
      }

      if (!hashesMatch(session.refreshTokenHash, currentTokenHash)) {
        await transaction.authSession.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now, updatedAt: now },
        });
        return { kind: 'reused' } as const;
      }

      const tokens = await this.issueTokens(
        session.userId,
        session.id,
        session.expiresAt,
      );
      const rotation = await transaction.authSession.updateMany({
        where: {
          id: session.id,
          userId: claims.sub,
          refreshTokenHash: currentTokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          refreshTokenHash: hashRefreshToken(tokens.refreshToken),
          updatedAt: now,
        },
      });

      if (rotation.count !== 1) {
        const latestSession = await transaction.authSession.findUnique({
          where: { id: session.id },
          select: { refreshTokenHash: true, revokedAt: true, expiresAt: true },
        });
        const reused =
          latestSession !== null &&
          latestSession.revokedAt === null &&
          latestSession.expiresAt > now &&
          !hashesMatch(latestSession.refreshTokenHash, currentTokenHash);

        if (reused) {
          await transaction.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now, updatedAt: now },
          });
        }

        return { kind: reused ? 'reused' : 'invalid' } as const;
      }

      return {
        kind: 'rotated',
        user: publicUser(session.user),
        tokens,
      } as const;
    });

    if (result.kind !== 'rotated') {
      throw new UnauthorizedException(
        'Invalid, expired, or reused refresh token',
      );
    }

    return { user: result.user, tokens: result.tokens };
  }

  async logoutCurrentSession(refreshToken: string): Promise<void> {
    const claims = await this.verifyRefreshToken(refreshToken);
    const now = new Date();
    await this.prisma.authSession.updateMany({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { revokedAt: now, updatedAt: now },
    });
  }

  async logoutAllSessions(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now, updatedAt: now },
    });
  }

  private async createSession(
    user: PublicUser,
    userAgent?: string,
  ): Promise<AuthResult> {
    const safeUser = publicUser(user);
    const sessionId = randomUUID();
    const refreshExpiresAt = this.refreshExpiry(new Date());
    const tokens = await this.issueTokens(
      safeUser.id,
      sessionId,
      refreshExpiresAt,
    );

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: safeUser.id,
        refreshTokenHash: hashRefreshToken(tokens.refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 512),
      },
    });

    return { user: safeUser, tokens };
  }

  private async issueTokens(
    userId: string,
    sessionId: string,
    refreshExpiresAt: Date,
  ): Promise<AuthTokens> {
    const now = new Date();
    const refreshTtlSeconds = Math.floor(
      (refreshExpiresAt.getTime() - now.getTime()) / 1000,
    );
    if (refreshTtlSeconds <= 0) {
      throw new UnauthorizedException('Session has expired');
    }

    const claims = { sub: userId, sid: sessionId };
    const accessTtlSeconds = this.config.getOrThrow<number>(
      'JWT_ACCESS_TOKEN_EXPIRATION',
    );
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { ...claims, tokenUse: 'access' },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: accessTtlSeconds,
          issuer: 'flowforge',
          audience: 'flowforge-api',
          algorithm: 'HS256',
          jwtid: randomUUID(),
        },
      ),
      this.jwt.signAsync(
        { ...claims, tokenUse: 'refresh' },
        {
          secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
          expiresIn: refreshTtlSeconds,
          issuer: 'flowforge',
          audience: 'flowforge-api',
          algorithm: 'HS256',
          jwtid: randomUUID(),
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(now.getTime() + accessTtlSeconds * 1000),
      refreshExpiresAt,
    };
  }

  private async verifyRefreshToken(token: string): Promise<TokenClaims> {
    let claims: unknown;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        issuer: 'flowforge',
        audience: 'flowforge-api',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!isTokenClaims(claims) || claims.tokenUse !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return claims;
  }

  private refreshExpiry(now: Date): Date {
    const ttlSeconds = this.config.getOrThrow<number>(
      'JWT_REFRESH_TOKEN_EXPIRATION',
    );
    return new Date(now.getTime() + ttlSeconds * 1000);
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= argon2.hash(
      randomBytes(32).toString('hex'),
      ARGON_OPTIONS,
    );
    return this.dummyPasswordHash;
  }
}

function publicUser(
  user: Pick<AuthenticatedUser, 'id' | 'email' | 'name'>,
): PublicUser {
  return { id: user.id, email: user.email, name: user.name };
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashesMatch(storedHash: string, presentedHash: string): boolean {
  const stored = Buffer.from(storedHash, 'hex');
  const presented = Buffer.from(presentedHash, 'hex');
  return (
    stored.length === presented.length && timingSafeEqual(stored, presented)
  );
}
