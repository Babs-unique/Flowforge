import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import {
  clearAuthCookies,
  REFRESH_COOKIE_NAME,
  setAuthCookies,
} from './auth.cookies.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type {
  AuthenticatedUser,
  PublicUser,
} from './types/authenticated-user.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicUser> {
    const result = await this.auth.register(
      body.email,
      body.password,
      body.name,
      getUserAgent(request),
    );
    setAuthCookies(response, this.config, result.tokens);
    return result.user;
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicUser> {
    const result = await this.auth.login(
      body.email,
      body.password,
      getUserAgent(request),
    );
    setAuthCookies(response, this.config, result.tokens);
    return result.user;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PublicUser> {
    const token: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof token !== 'string') {
      throw new UnauthorizedException('Refresh token required');
    }

    const result = await this.auth.refresh(token);
    setAuthCookies(response, this.config, result.tokens);
    return result.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    try {
      if (typeof token === 'string') {
        await this.auth.logoutCurrentSession(token);
      }
    } finally {
      clearAuthCookies(response, this.config);
    }
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logoutAllSessions(user.id);
    clearAuthCookies(response, this.config);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentUser() user: AuthenticatedUser): PublicUser {
    const { id, email, name } = user;
    return { id, email, name };
  }
}

function getUserAgent(request: Request): string | undefined {
  return request.get('user-agent')?.slice(0, 512);
}
