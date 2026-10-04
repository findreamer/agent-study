import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from './jwt-auth.guard.js';

export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthUser => {
    return context.switchToHttp().getRequest().user;
  },
);
