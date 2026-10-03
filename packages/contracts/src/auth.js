"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionInfoSchema = exports.refreshResponseSchema = exports.loginResponseSchema = exports.profileResponseSchema = exports.changePasswordSchema = exports.switchSystemSchema = exports.loginSchema = void 0;
const zod_1 = require("zod");
const user_1 = require("./user");
const system_1 = require("./system");
const menu_1 = require("./menu");
exports.loginSchema = zod_1.z.object({
    username: zod_1.z.string().min(4).max(32),
    password: zod_1.z.string().min(8).max(64),
});
exports.switchSystemSchema = zod_1.z.object({
    systemCode: zod_1.z.string().min(1).max(32),
});
exports.changePasswordSchema = zod_1.z
    .object({
    oldPassword: zod_1.z.string().min(8).max(64),
    newPassword: zod_1.z.string().min(8).max(64),
})
    .refine((v) => v.oldPassword !== v.newPassword, {
    message: 'new password must differ from old password',
    path: ['newPassword'],
});
exports.profileResponseSchema = zod_1.z.object({
    user: user_1.userBriefSchema,
    currentSystemCode: zod_1.z.string(),
    systems: zod_1.z.array(system_1.systemBriefSchema),
    menus: zod_1.z.array(menu_1.menuNodeSchema),
    permissions: zod_1.z.array(zod_1.z.string()),
});
exports.loginResponseSchema = zod_1.z.object({
    accessToken: zod_1.z.string(),
    profile: exports.profileResponseSchema,
});
exports.refreshResponseSchema = zod_1.z.object({
    accessToken: zod_1.z.string(),
});
exports.sessionInfoSchema = zod_1.z.object({
    familyId: zod_1.z.string(),
    userAgent: zod_1.z.string().nullable(),
    ip: zod_1.z.string().nullable(),
    lastUsedAt: zod_1.z.string().nullable(),
    current: zod_1.z.boolean(),
});
//# sourceMappingURL=auth.js.map