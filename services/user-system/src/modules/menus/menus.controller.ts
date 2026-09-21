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
  createMenuSchema,
  menuTreeQuerySchema,
  updateMenuSchema,
  type CreateMenuInput,
  type MenuTreeQuery,
  type UpdateMenuInput,
} from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { MenusService } from './menus.service.js';

@Controller('menus')
export class MenusController {
  constructor(
    private readonly menus: MenusService,
    private readonly audit: AuditService,
  ) {}

  @Permissions('menu:list')
  @Get('tree')
  tree(
    @CurrentUser() _user: AuthUser,
    @Query(new ZodValidationPipe(menuTreeQuerySchema)) query: MenuTreeQuery,
  ) {
    return this.menus.tree(query);
  }

  @Permissions('menu:create')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMenuSchema)) body: CreateMenuInput,
    @Req() req: Request,
  ) {
    return this.menus.create(body).then((created) => {
      this.audit.log({
        event: 'menu_created',
        actorId: user.id,
        targetType: 'menu',
        targetId: created.id,
        after: { permissionCode: created.permissionCode },
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return created;
    });
  }

  @Permissions('menu:update')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMenuSchema)) body: UpdateMenuInput,
    @Req() req: Request,
  ) {
    return this.menus.update(id, body).then((updated) => {
      this.audit.log({
        event: 'menu_updated',
        actorId: user.id,
        targetType: 'menu',
        targetId: id,
        after: body,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return updated;
    });
  }

  @Permissions('menu:delete')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.menus.remove(id).then((result) => {
      this.audit.log({
        event: 'menu_deleted',
        actorId: user.id,
        targetType: 'menu',
        targetId: id,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return result;
    });
  }
}
