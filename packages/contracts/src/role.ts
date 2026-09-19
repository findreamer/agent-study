import { z } from 'zod';
import { codePattern } from './system.js';
import { commonStatusEnum, dataScopeEnum } from './enums.js';
import { listQuerySchema } from './common.js';

export const roleBriefSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  code: z.string(),
  name: z.string(),
  status: commonStatusEnum,
  priority: z.number(),
  dataScope: dataScopeEnum,
  remark: z.string().nullable(),
});
export type RoleBrief = z.infer<typeof roleBriefSchema>;

export const roleDetailSchema = roleBriefSchema.extend({
  menuIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type RoleDetail = z.infer<typeof roleDetailSchema>;

export const createRoleSchema = z.object({
  systemId: z.string().min(1),
  code: z.string().min(1).max(32).regex(codePattern),
  name: z.string().min(1).max(32),
  status: commonStatusEnum.default('ENABLED'),
  priority: z.number().int().nonnegative().default(100),
  dataScope: dataScopeEnum.default('SELF'),
  remark: z.string().max(200).nullable().optional(),
  menuIds: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z
  .object({
    code: z.string().min(1).max(32).regex(codePattern),
    name: z.string().min(1).max(32),
    status: commonStatusEnum,
    priority: z.number().int().nonnegative(),
    dataScope: dataScopeEnum,
    remark: z.string().max(200).nullable(),
    menuIds: z.array(z.string()),
  })
  .partial();
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const roleListQuerySchema = listQuerySchema.extend({
  systemId: z.string().min(1),
});
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
