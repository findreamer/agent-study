import { z } from 'zod';
import { commonStatusEnum } from './enums.js';
import type { CommonStatus } from './enums.js';

export const createDepartmentSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(32),
  leader: z.string().max(32).nullable().optional(),
  sort: z.number().int().nonnegative().default(0),
  status: commonStatusEnum.default('ENABLED'),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const updateDepartmentSchema = z.object({
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(32).optional(),
  leader: z.string().max(32).nullable().optional(),
  sort: z.number().int().nonnegative().optional(),
  status: commonStatusEnum.optional(),
});
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export type DepartmentNode = {
  id: string;
  parentId: string | null;
  name: string;
  leader: string | null;
  sort: number;
  status: CommonStatus;
  children?: DepartmentNode[];
};

export const departmentNodeSchema: z.ZodType<DepartmentNode> = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  leader: z.string().nullable(),
  sort: z.number(),
  status: commonStatusEnum,
  children: z.lazy(() => z.array(departmentNodeSchema)).optional(),
});
