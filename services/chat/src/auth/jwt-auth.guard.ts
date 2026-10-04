import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthUser {
  /** user-system User.id（JWT payload.sub） */
  userId: string;
  username: string;
}

/**
 * chat 服务不签发 token，只对 user-system 签发的 access token 做本地验签
 * （HS256 + 共享 JWT_SECRET），验签通过后把 userId 挂到 req.user 供下游隔离数据。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization: Bearer <token>');
    }
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        header.slice('Bearer '.length),
      );
      if (typeof payload['sub'] !== 'string') {
        throw new Error('payload.sub 缺失');
      }
      (request as Request & { user?: AuthUser }).user = {
        userId: payload['sub'],
        username: String(payload['username'] ?? ''),
      } satisfies AuthUser;
    } catch {
      throw new UnauthorizedException('token 无效或已过期');
    }
    return true;
  }
}
