import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { TokenService } from '../auth/token.service.js';
import type { AuthUser } from '../auth/auth.constants.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('missing access token');
    }
    const payload = await this.tokens.verifyAccessToken(header.slice('Bearer '.length));
    // Task 7 replaces this payload-only principal with a fresh DB lookup.
    request.user = {
      id: payload.sub,
      username: payload.username,
      isSuperadmin: payload.isSuperadmin,
      departmentId: null,
      systemId: payload.systemId,
    };
    return true;
  }
}
