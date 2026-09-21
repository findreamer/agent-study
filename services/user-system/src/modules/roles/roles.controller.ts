import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createRoleSchema,
  roleListQuerySchema,
  updateRoleSchema,
  type CreateRoleInput,
  type RoleListQuery,
  type UpdateRoleInput,
} from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { RolesService } from './roles.service.js';

@Controller('roles')
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  @Permissions('role:list')
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(roleListQuerySchema)) query: RoleListQuery,
  ) {
    return this.roles.list(user, query);
  }

  @Permissions('role:create')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
    @Req() req: Request,
  ) {
    return this.roles.create(user, body).then((created) => {
      this.audit.log({
        event: 'role_created',
        actorId: user.id,
        targetType: 'role',
        targetId: created.id,
        after: { code: created.code, menuIds: created.menuIds },
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return created;
    });
  }

  @Permissions('role:update')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
    @Req() req: Request,
  ) {
    return this.roles.update(user, id, body).then((updated) => {
      this.audit.log({
        event: body.menuIds ? 'role_menus_updated' : 'role_updated',
        actorId: user.id,
        targetType: 'role',
        targetId: id,
        before: body.menuIds,
        after: { menuIds: updated.menuIds },
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return updated;
    });
  }

  @Permissions('role:delete')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.roles.remove(user, id).then((result) => {
      this.audit.log({
        event: 'role_deleted',
        actorId: user.id,
        targetType: 'role',
        targetId: id,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return result;
    });
  }
}
