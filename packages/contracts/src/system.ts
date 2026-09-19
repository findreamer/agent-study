import { z } from 'zod';
import { commonStatusEnum } from './enums.js';

export const codePattern = /^[a-z0-9_-]+$/;

export const systemBriefSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  status: commonStatusEnum,
  sort: z.number(),
});
export type SystemBrief = z.infer<typeof systemBriefSchema>;

export const systemDetailSchema = systemBriefSchema.extend({
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SystemDetail = z.infer<typeof systemDetailSchema>;

export const createSystemSchema = z.object({
  code: z.string().min(1).max(32).regex(codePattern),
  name: z.string().min(1).max(32),
  sort: z.number().int().nonnegative().default(0),
  status: commonStatusEnum.default('ENABLED'),
});
export type CreateSystemInput = z.infer<typeof createSystemSchema>;

export const updateSystemSchema = z.object({
  code: z.string().min(1).max(32).regex(codePattern).optional(),
  name: z.string().min(1).max(32).optional(),
  sort: z.number().int().nonnegative().optional(),
  status: commonStatusEnum.optional(),
});
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;
