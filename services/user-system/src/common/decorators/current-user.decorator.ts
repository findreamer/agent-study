import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.constants.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    return ctx.switchToHttp().getRequest().user;
  },
);
