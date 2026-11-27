import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  clearAuthCookies,
  setAuthCookies,
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from './auth.cookies.js';
import { AuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { AuthTokens } from './types/auth-tokens.js';
import type { Request } from 'express';

describe('authentication cookies', () => {
  const configValues = {
    NODE_ENV: 'production',
    COOKIE_SAME_SITE: 'lax',
    COOKIE_DOMAIN: 'flowforge.example',
  };
  const config = {
    get: (key: string) => configValues[key as keyof typeof configValues],
    getOrThrow: (key: string) => configValues[key as keyof typeof configValues],
  } as ConfigService;
  const tokens: AuthTokens = {
    accessToken: 'access-token-value',
    refreshToken: 'refresh-token-value',
    accessExpiresAt: new Date(Date.now() + 60_000),
    refreshExpiresAt: new Date(Date.now() + 86_400_000),
  };

  it('sets HttpOnly, Secure cookies with scoped paths and explicit expiry', () => {
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };

    setAuthCookies(response as unknown as Response, config, tokens);

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      ACCESS_COOKIE_NAME,
      tokens.accessToken,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        domain: 'flowforge.example',
        path: '/',
        expires: tokens.accessExpiresAt,
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      REFRESH_COOKIE_NAME,
      tokens.refreshToken,
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        path: '/auth',
        expires: tokens.refreshExpiresAt,
      }),
    );
  });

  it('clears both cookies with matching scope attributes', () => {
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };

    clearAuthCookies(response as unknown as Response, config);

    expect(response.clearCookie).toHaveBeenNthCalledWith(
      1,
      ACCESS_COOKIE_NAME,
      expect.objectContaining({
        path: '/',
        domain: 'flowforge.example',
        secure: true,
      }),
    );
    expect(response.clearCookie).toHaveBeenNthCalledWith(
      2,
      REFRESH_COOKIE_NAME,
      expect.objectContaining({
        path: '/auth',
        domain: 'flowforge.example',
        secure: true,
      }),
    );
  });

  it('returns only the user from register responses, never the tokens', async () => {
    const user = {
      id: 'user-id',
      email: 'user@example.com',
      name: 'Flow User',
    };
    const auth = {
      register: vi.fn().mockResolvedValue({ user, tokens }),
    } as unknown as AuthService;
    const controller = new AuthController(auth, config);
    const response = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    };
    const request = { get: () => undefined } as unknown as Request;

    await expect(
      controller.register(
        { email: user.email, password: 'some-long-password', name: user.name! },
        request,
        response as unknown as Response,
      ),
    ).resolves.toEqual(user);
  });
});
