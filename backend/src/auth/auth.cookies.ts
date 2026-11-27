import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { AuthTokens } from './types/auth-tokens.js';

export const ACCESS_COOKIE_NAME = 'flowforge_access';
export const REFRESH_COOKIE_NAME = 'flowforge_refresh';

function cookieOptions(config: ConfigService, path: string): CookieOptions {
  const domain = config.get<string>('COOKIE_DOMAIN');

  return {
    httpOnly: true,
    secure: config.getOrThrow<string>('NODE_ENV') === 'production',
    sameSite: config.getOrThrow<'strict' | 'lax' | 'none'>('COOKIE_SAME_SITE'),
    path,
    ...(domain ? { domain } : {}),
  };
}

export function setAuthCookies(
  response: Response,
  config: ConfigService,
  tokens: AuthTokens,
): void {
  const now = Date.now();

  response.cookie(ACCESS_COOKIE_NAME, tokens.accessToken, {
    ...cookieOptions(config, '/'),
    expires: tokens.accessExpiresAt,
    maxAge: Math.max(0, tokens.accessExpiresAt.getTime() - now),
  });
  response.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
    ...cookieOptions(config, '/auth'),
    expires: tokens.refreshExpiresAt,
    maxAge: Math.max(0, tokens.refreshExpiresAt.getTime() - now),
  });
}

export function clearAuthCookies(
  response: Response,
  config: ConfigService,
): void {
  response.clearCookie(ACCESS_COOKIE_NAME, cookieOptions(config, '/'));
  response.clearCookie(REFRESH_COOKIE_NAME, cookieOptions(config, '/auth'));
}
