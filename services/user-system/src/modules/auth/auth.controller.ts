import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loginSchema, type LoginInput } from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser, TokenContext } from '../../common/auth/auth.constants.js';
import { REFRESH_COOKIE } from '../../common/auth/auth.constants.js';
import { TokenService } from '../../common/auth/token.service.js';
import { clearRefreshCookie, setRefreshCookie } from '../../common/auth/cookie.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly tokens: TokenService,
  ) {}

  private context(req: Request): TokenContext {
    return { ua: req.headers['user-agent'] ?? null, ip: req.ip ?? null };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, profile } = await this.authService.login(
      body,
      this.context(req),
    );
    setRefreshCookie(res, refreshToken);
    return { accessToken, profile };
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_COOKIE
    ];
    if (!raw) throw new UnauthorizedException('missing refresh token');
    try {
      const { accessToken, refreshToken } = await this.tokens.rotate(
        raw,
        this.context(req),
      );
      setRefreshCookie(res, refreshToken);
      return { accessToken };
    } catch (error) {
      clearRefreshCookie(res);
      throw error;
    }
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_COOKIE
    ];
    if (raw) {
      const familyId = await this.tokens.familyIdOfRaw(raw);
      if (familyId) await this.tokens.revokeFamilyById(familyId);
    }
    clearRefreshCookie(res);
    return { ok: true };
  }
}
