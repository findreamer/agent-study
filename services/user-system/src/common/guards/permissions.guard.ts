import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/auth.constants.js';
import { PermissionsService } from '../rbac/permissions.service.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException('no authenticated user');
    if (user.isSuperadmin) return true;

    const granted = await this.permissions.getCodes(user.id, user.systemId);
    const grantedSet = new Set(granted);
    if (required.every((code) => grantedSet.has(code))) return true;
    throw new ForbiddenException('missing required permission');
  }
}
