import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userListQuerySchema,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
  type UserListQuery,
} from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Permissions('user:list')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(userListQuerySchema)) query: UserListQuery,
  ) {
    return this.users.list(user, query);
  }

  @Permissions('user:list')
  @Get(':id')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.detail(user, id);
  }

  @Permissions('user:create')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @Req() req: Request,
  ) {
    return this.users.create(user, body).then((created) => {
      this.audit.log({
        event: 'user_created',
        actorId: user.id,
        targetType: 'user',
        targetId: created.id,
        after: { username: created.username },
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return created;
    });
  }

  @Permissions('user:update')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @Req() req: Request,
  ) {
    return this.users.update(user, id, body).then((updated) => {
      this.audit.log({
        event: 'user_updated',
        actorId: user.id,
        targetType: 'user',
        targetId: id,
        after: body,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return updated;
    });
  }

  @Permissions('user:reset-password')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() req: Request,
  ) {
    return this.users.resetPassword(user, id, body).then((updated) => {
      this.audit.log({
        event: 'user_password_reset',
        actorId: user.id,
        targetType: 'user',
        targetId: id,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return updated;
    });
  }
}
