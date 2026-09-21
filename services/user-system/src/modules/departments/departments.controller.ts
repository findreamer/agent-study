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
  createDepartmentSchema,
  updateDepartmentSchema,
  type CreateDepartmentInput,
  type UpdateDepartmentInput,
} from '@agent-study/contracts';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { DepartmentsService } from './departments.service.js';

@Controller('departments')
export class DepartmentsController {
  constructor(
    private readonly departments: DepartmentsService,
    private readonly audit: AuditService,
  ) {}

  @Permissions('dept:list')
  @Get('tree')
  tree() {
    return this.departments.tree();
  }

  @Permissions('department:create')
  @Post()
  async create(
    @Body(new ZodValidationPipe(createDepartmentSchema)) body: CreateDepartmentInput,
    @Req() req: Request,
  ) {
    const created = await this.departments.create(body);
    this.audit.log({
      event: 'department_created',
      targetType: 'department',
      targetId: created.id,
      after: created,
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    return created;
  }

  @Permissions('department:update')
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateDepartmentSchema)) body: UpdateDepartmentInput,
    @Req() req: Request,
  ) {
    const updated = await this.departments.update(id, body);
    this.audit.log({
      event: 'department_updated',
      targetType: 'department',
      targetId: id,
      after: updated,
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    return updated;
  }

  @Permissions('department:delete')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    const result = await this.departments.remove(id);
    this.audit.log({
      event: 'department_deleted',
      targetType: 'department',
      targetId: id,
      ip: req.ip,
      ua: req.headers['user-agent'],
    });
    return result;
  }
}
