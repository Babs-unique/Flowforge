import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ACCESS_COOKIE_NAME } from '../auth.cookies.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';
import { isTokenClaims } from '../types/auth-tokens.js';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const accessToken: unknown = request.cookies?.[ACCESS_COOKIE_NAME];
    if (typeof accessToken !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    let claims: unknown;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(
        accessToken,
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          issuer: 'flowforge',
          audience: 'flowforge-api',
          algorithms: ['HS256'],
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    if (!isTokenClaims(claims) || claims.tokenUse !== 'access') {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const session = await this.prisma.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = {
      ...session.user,
      sessionId: session.id,
    };
    return true;
  }
}
