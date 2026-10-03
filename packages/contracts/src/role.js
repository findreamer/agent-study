"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleListQuerySchema = exports.updateRoleSchema = exports.createRoleSchema = exports.roleDetailSchema = exports.roleBriefSchema = void 0;
const zod_1 = require("zod");
const system_1 = require("./system");
const enums_1 = require("./enums");
const common_1 = require("./common");
exports.roleBriefSchema = zod_1.z.object({
    id: zod_1.z.string(),
    systemId: zod_1.z.string(),
    code: zod_1.z.string(),
    name: zod_1.z.string(),
    status: enums_1.commonStatusEnum,
    priority: zod_1.z.number(),
    dataScope: enums_1.dataScopeEnum,
    remark: zod_1.z.string().nullable(),
});
exports.roleDetailSchema = exports.roleBriefSchema.extend({
    menuIds: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.createRoleSchema = zod_1.z.object({
    systemId: zod_1.z.string().min(1),
    code: zod_1.z.string().min(1).max(32).regex(system_1.codePattern),
    name: zod_1.z.string().min(1).max(32),
    status: enums_1.commonStatusEnum.default('ENABLED'),
    priority: zod_1.z.number().int().nonnegative().default(100),
    dataScope: enums_1.dataScopeEnum.default('SELF'),
    remark: zod_1.z.string().max(200).nullable().optional(),
    menuIds: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.updateRoleSchema = zod_1.z
    .object({
    code: zod_1.z.string().min(1).max(32).regex(system_1.codePattern),
    name: zod_1.z.string().min(1).max(32),
    status: enums_1.commonStatusEnum,
    priority: zod_1.z.number().int().nonnegative(),
    dataScope: enums_1.dataScopeEnum,
    remark: zod_1.z.string().max(200).nullable(),
    menuIds: zod_1.z.array(zod_1.z.string()),
})
    .partial();
exports.roleListQuerySchema = common_1.listQuerySchema.extend({
    systemId: zod_1.z.string().min(1),
});
//# sourceMappingURL=role.js.map