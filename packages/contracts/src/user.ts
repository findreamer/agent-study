import { z } from 'zod';
import { userStatusEnum } from './enums.js';
import { listQuerySchema } from './common.js';

export const userBriefSchema = z.object({
  id: z.string(),
  username: z.string(),
  nickname: z.string(),
  email: z.string().nullable(),
  status: userStatusEnum,
  isSuperadmin: z.boolean(),
  departmentId: z.string().nullable(),
});
export type UserBrief = z.infer<typeof userBriefSchema>;

export const userDetailSchema = userBriefSchema.extend({
  departmentName: z.string().nullable().optional(),
  roleIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

const usernameRule = z
  .string()
  .min(4)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, 'username may only contain letters, digits and underscore');
const passwordRule = z.string().min(8).max(64);

export const createUserSchema = z.object({
  username: usernameRule,
  password: passwordRule,
  nickname: z.string().min(1).max(32),
  email: z.string().email().max(128).nullable().optional(),
  departmentId: z.string().nullable().optional(),
  roleIds: z.array(z.string()).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    nickname: z.string().min(1).max(32),
    email: z.string().email().max(128).nullable(),
    status: userStatusEnum,
    departmentId: z.string().nullable(),
    roleIds: z.array(z.string()),
  })
  .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  newPassword: passwordRule,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const userListQuerySchema = listQuerySchema.extend({
  departmentId: z.string().optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
