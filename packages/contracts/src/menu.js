"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.menuTreeQuerySchema = exports.updateMenuSchema = exports.createMenuSchema = exports.menuDetailSchema = exports.menuNodeSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
const permissionCodeRule = zod_1.z
    .string()
    .regex(/^[a-z]+:[a-z-]+$/, 'permission code must look like resource:action')
    .nullable()
    .optional();
exports.menuNodeSchema = zod_1.z.object({
    id: zod_1.z.string(),
    parentId: zod_1.z.string().nullable(),
    type: enums_1.menuTypeEnum,
    name: zod_1.z.string(),
    path: zod_1.z.string().nullable().optional(),
    component: zod_1.z.string().nullable().optional(),
    icon: zod_1.z.string().nullable().optional(),
    permissionCode: zod_1.z.string().nullable().optional(),
    visible: zod_1.z.boolean(),
    status: enums_1.commonStatusEnum,
    sort: zod_1.z.number(),
    children: zod_1.z.lazy(() => zod_1.z.array(exports.menuNodeSchema)).optional(),
});
exports.menuDetailSchema = zod_1.z.object({
    id: zod_1.z.string(),
    systemId: zod_1.z.string(),
    parentId: zod_1.z.string().nullable(),
    type: enums_1.menuTypeEnum,
    name: zod_1.z.string(),
    path: zod_1.z.string().nullable(),
    component: zod_1.z.string().nullable(),
    icon: zod_1.z.string().nullable(),
    permissionCode: zod_1.z.string().nullable(),
    visible: zod_1.z.boolean(),
    status: enums_1.commonStatusEnum,
    sort: zod_1.z.number(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.createMenuSchema = zod_1.z
    .object({
    systemId: zod_1.z.string().min(1),
    parentId: zod_1.z.string().nullable().optional(),
    type: enums_1.menuTypeEnum,
    name: zod_1.z.string().min(1).max(32),
    path: zod_1.z.string().max(128).nullable().optional(),
    component: zod_1.z.string().max(128).nullable().optional(),
    icon: zod_1.z.string().max(64).nullable().optional(),
    permissionCode: permissionCodeRule,
    visible: zod_1.z.boolean().default(true),
    sort: zod_1.z.number().int().nonnegative().default(0),
    status: enums_1.commonStatusEnum.default('ENABLED'),
})
    .refine((m) => m.type !== 'BUTTON' || (!m.path && !m.component), {
    message: 'button nodes must not define path or component',
    path: ['type'],
})
    .refine((m) => m.type !== 'MENU' || Boolean(m.path), {
    message: 'menu nodes must define a path',
    path: ['path'],
});
exports.updateMenuSchema = zod_1.z
    .object({
    parentId: zod_1.z.string().nullable(),
    type: enums_1.menuTypeEnum,
    name: zod_1.z.string().min(1).max(32),
    path: zod_1.z.string().max(128).nullable(),
    component: zod_1.z.string().max(128).nullable(),
    icon: zod_1.z.string().max(64).nullable(),
    permissionCode: zod_1.z
        .string()
        .regex(/^[a-z]+:[a-z-]+$/, 'permission code must look like resource:action')
        .nullable(),
    visible: zod_1.z.boolean(),
    sort: zod_1.z.number().int().nonnegative(),
    status: enums_1.commonStatusEnum,
})
    .partial();
exports.menuTreeQuerySchema = zod_1.z.object({
    systemId: zod_1.z.string().min(1),
});
//# sourceMappingURL=menu.js.map