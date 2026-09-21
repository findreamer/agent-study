import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  switchSystemSchema,
  type ChangePasswordInput,
  type LoginInput,
  type SwitchSystemInput,
} from '@agent-study/contracts';
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

  private async currentFamilyId(req: Request): Promise<string | null> {
    const raw = (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_COOKIE
    ];
    return raw ? this.tokens.familyIdOfRaw(raw) : null;
  }

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.authService.profile(user);
  }

  @Post('switch-system')
  async switchSystem(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(switchSystemSchema)) body: SwitchSystemInput,
    @Req() req: Request,
  ) {
    const familyId = await this.currentFamilyId(req);
    return this.authService.switchSystem(user, body, familyId);
  }

  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const familyId = await this.currentFamilyId(req);
    return this.authService.sessions(user, familyId);
  }

  @Delete('sessions/:familyId')
  revokeSession(@CurrentUser() user: AuthUser, @Param('familyId') familyId: string) {
    return this.authService.revokeSession(user, familyId);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() req: Request,
  ) {
    return this.currentFamilyId(req).then((familyId) =>
      this.authService.changePassword(user, body, familyId),
    );
  }
}
