"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userListQuerySchema = exports.resetPasswordSchema = exports.updateUserSchema = exports.createUserSchema = exports.userDetailSchema = exports.userBriefSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
const common_1 = require("./common");
exports.userBriefSchema = zod_1.z.object({
    id: zod_1.z.string(),
    username: zod_1.z.string(),
    nickname: zod_1.z.string(),
    email: zod_1.z.string().nullable(),
    status: enums_1.userStatusEnum,
    isSuperadmin: zod_1.z.boolean(),
    departmentId: zod_1.z.string().nullable(),
});
exports.userDetailSchema = exports.userBriefSchema.extend({
    departmentName: zod_1.z.string().nullable().optional(),
    roleIds: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
const usernameRule = zod_1.z
    .string()
    .min(4)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, 'username may only contain letters, digits and underscore');
const passwordRule = zod_1.z.string().min(8).max(64);
exports.createUserSchema = zod_1.z.object({
    username: usernameRule,
    password: passwordRule,
    nickname: zod_1.z.string().min(1).max(32),
    email: zod_1.z.string().email().max(128).nullable().optional(),
    departmentId: zod_1.z.string().nullable().optional(),
    roleIds: zod_1.z.array(zod_1.z.string()).default([]),
});
exports.updateUserSchema = zod_1.z
    .object({
    nickname: zod_1.z.string().min(1).max(32),
    email: zod_1.z.string().email().max(128).nullable(),
    status: enums_1.userStatusEnum,
    departmentId: zod_1.z.string().nullable(),
    roleIds: zod_1.z.array(zod_1.z.string()),
})
    .partial();
exports.resetPasswordSchema = zod_1.z.object({
    newPassword: passwordRule,
});
exports.userListQuerySchema = common_1.listQuerySchema.extend({
    departmentId: zod_1.z.string().optional(),
});
//# sourceMappingURL=user.js.map