import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  private readonly allowedOrigins: string[];
  private readonly isDevelopment: boolean;

  constructor(config: ConfigService) {
    this.isDevelopment =
      config.getOrThrow<string>('NODE_ENV') === 'development';
    const rawOrigins = config.getOrThrow<string | string[]>('CORS_ORIGINS');

    const originsArray = Array.isArray(rawOrigins)
      ? rawOrigins
      : rawOrigins.split(',');

    this.allowedOrigins = originsArray
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (
      this.isDevelopment ||
      !STATE_CHANGING_METHODS.has(request.method)
    ) {
      return true;
    }

    const origin = request.get('origin');
    if (!origin || !this.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Untrusted or missing request origin');
    }

    return true;
  }
}
