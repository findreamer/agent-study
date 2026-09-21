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
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
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

    // Fresh DB lookup on every request: disabling a user takes effect
    // immediately regardless of the access token's 1-day lifetime.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        isSuperadmin: true,
        departmentId: true,
        status: true,
      },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('user is not active');
    }

    request.user = {
      id: user.id,
      username: user.username,
      isSuperadmin: user.isSuperadmin,
      departmentId: user.departmentId,
      systemId: payload.systemId,
    };
    return true;
  }
}
