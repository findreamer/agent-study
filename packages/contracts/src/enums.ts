import { z } from 'zod';

export const userStatusEnum = z.enum(['ACTIVE', 'DISABLED']);
export type UserStatus = z.infer<typeof userStatusEnum>;

export const commonStatusEnum = z.enum(['ENABLED', 'DISABLED']);
export type CommonStatus = z.infer<typeof commonStatusEnum>;

export const menuTypeEnum = z.enum(['DIR', 'MENU', 'BUTTON']);
export type MenuType = z.infer<typeof menuTypeEnum>;

export const dataScopeEnum = z.enum(['ALL', 'DEPT_AND_SUB', 'DEPT', 'SELF']);
export type DataScope = z.infer<typeof dataScopeEnum>;
