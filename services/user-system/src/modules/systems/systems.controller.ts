import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createSystemSchema,
  updateSystemSchema,
  type CreateSystemInput,
  type UpdateSystemInput,
} from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/auth/auth.constants.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { SystemsService } from './systems.service.js';

@Controller('systems')
export class SystemsController {
  constructor(
    private readonly systems: SystemsService,
    private readonly audit: AuditService,
  ) {}

  @Permissions('system:list')
  @Get()
  list() {
    return this.systems.list();
  }

  @Permissions('system:create')
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSystemSchema)) body: CreateSystemInput,
    @Req() req: Request,
  ) {
    return this.systems.create(user, body).then((created) => {
      this.audit.log({
        event: 'system_created',
        actorId: user.id,
        targetType: 'system',
        targetId: created.id,
        after: { code: created.code },
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return created;
    });
  }

  @Permissions('system:update')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateSystemSchema)) body: UpdateSystemInput,
    @Req() req: Request,
  ) {
    return this.systems.update(user, id, body).then((updated) => {
      this.audit.log({
        event: 'system_updated',
        actorId: user.id,
        targetType: 'system',
        targetId: id,
        after: body,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return updated;
    });
  }

  @Permissions('system:delete')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    return this.systems.remove(user, id).then((result) => {
      this.audit.log({
        event: 'system_deleted',
        actorId: user.id,
        targetType: 'system',
        targetId: id,
        ip: req.ip,
        ua: req.headers['user-agent'],
      });
      return result;
    });
  }
}
