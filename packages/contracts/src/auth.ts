import { z } from 'zod';
import { userBriefSchema } from './user.js';
import { systemBriefSchema } from './system.js';
import { menuNodeSchema } from './menu.js';

export const loginSchema = z.object({
  username: z.string().min(4).max(32),
  password: z.string().min(8).max(64),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchSystemSchema = z.object({
  systemCode: z.string().min(1).max(32),
});
export type SwitchSystemInput = z.infer<typeof switchSystemSchema>;

export const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(8).max(64),
    newPassword: z.string().min(8).max(64),
  })
  .refine((v) => v.oldPassword !== v.newPassword, {
    message: 'new password must differ from old password',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const profileResponseSchema = z.object({
  user: userBriefSchema,
  currentSystemCode: z.string(),
  systems: z.array(systemBriefSchema),
  menus: z.array(menuNodeSchema),
  permissions: z.array(z.string()),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  profile: profileResponseSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const sessionInfoSchema = z.object({
  familyId: z.string(),
  userAgent: z.string().nullable(),
  ip: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
