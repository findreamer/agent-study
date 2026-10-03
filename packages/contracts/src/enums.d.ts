import { z } from 'zod';
export declare const userStatusEnum: z.ZodEnum<["ACTIVE", "DISABLED"]>;
export type UserStatus = z.infer<typeof userStatusEnum>;
export declare const commonStatusEnum: z.ZodEnum<["ENABLED", "DISABLED"]>;
export type CommonStatus = z.infer<typeof commonStatusEnum>;
export declare const menuTypeEnum: z.ZodEnum<["DIR", "MENU", "BUTTON"]>;
export type MenuType = z.infer<typeof menuTypeEnum>;
export declare const dataScopeEnum: z.ZodEnum<["ALL", "DEPT_AND_SUB", "DEPT", "SELF"]>;
export type DataScope = z.infer<typeof dataScopeEnum>;
