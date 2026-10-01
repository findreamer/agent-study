import { z } from 'zod';
import { commonStatusEnum, menuTypeEnum } from './enums';
import type { CommonStatus, MenuType } from './enums';

const permissionCodeRule = z
  .string()
  .regex(/^[a-z]+:[a-z-]+$/, 'permission code must look like resource:action')
  .nullable()
  .optional();

export type MenuNode = {
  id: string;
  parentId: string | null;
  type: MenuType;
  name: string;
  path?: string | null;
  component?: string | null;
  icon?: string | null;
  permissionCode?: string | null;
  visible: boolean;
  status: CommonStatus;
  sort: number;
  children?: MenuNode[];
};

export const menuNodeSchema: z.ZodType<MenuNode> = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  type: menuTypeEnum,
  name: z.string(),
  path: z.string().nullable().optional(),
  component: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  permissionCode: z.string().nullable().optional(),
  visible: z.boolean(),
  status: commonStatusEnum,
  sort: z.number(),
  children: z.lazy(() => z.array(menuNodeSchema)).optional(),
});

export const menuDetailSchema = z.object({
  id: z.string(),
  systemId: z.string(),
  parentId: z.string().nullable(),
  type: menuTypeEnum,
  name: z.string(),
  path: z.string().nullable(),
  component: z.string().nullable(),
  icon: z.string().nullable(),
  permissionCode: z.string().nullable(),
  visible: z.boolean(),
  status: commonStatusEnum,
  sort: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type MenuDetail = z.infer<typeof menuDetailSchema>;

export const createMenuSchema = z
  .object({
    systemId: z.string().min(1),
    parentId: z.string().nullable().optional(),
    type: menuTypeEnum,
    name: z.string().min(1).max(32),
    path: z.string().max(128).nullable().optional(),
    component: z.string().max(128).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    permissionCode: permissionCodeRule,
    visible: z.boolean().default(true),
    sort: z.number().int().nonnegative().default(0),
    status: commonStatusEnum.default('ENABLED'),
  })
  .refine((m) => m.type !== 'BUTTON' || (!m.path && !m.component), {
    message: 'button nodes must not define path or component',
    path: ['type'],
  })
  .refine((m) => m.type !== 'MENU' || Boolean(m.path), {
    message: 'menu nodes must define a path',
    path: ['path'],
  });
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = z
  .object({
    parentId: z.string().nullable(),
    type: menuTypeEnum,
    name: z.string().min(1).max(32),
    path: z.string().max(128).nullable(),
    component: z.string().max(128).nullable(),
    icon: z.string().max(64).nullable(),
    permissionCode: z
      .string()
      .regex(/^[a-z]+:[a-z-]+$/, 'permission code must look like resource:action')
      .nullable(),
    visible: z.boolean(),
    sort: z.number().int().nonnegative(),
    status: commonStatusEnum,
  })
  .partial();
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const menuTreeQuerySchema = z.object({
  systemId: z.string().min(1),
});
export type MenuTreeQuery = z.infer<typeof menuTreeQuerySchema>;
