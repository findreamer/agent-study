"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSystemSchema = exports.createSystemSchema = exports.systemDetailSchema = exports.systemBriefSchema = exports.codePattern = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
exports.codePattern = /^[a-z0-9_-]+$/;
exports.systemBriefSchema = zod_1.z.object({
    id: zod_1.z.string(),
    code: zod_1.z.string(),
    name: zod_1.z.string(),
    status: enums_1.commonStatusEnum,
    sort: zod_1.z.number(),
});
exports.systemDetailSchema = exports.systemBriefSchema.extend({
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.createSystemSchema = zod_1.z.object({
    code: zod_1.z.string().min(1).max(32).regex(exports.codePattern),
    name: zod_1.z.string().min(1).max(32),
    sort: zod_1.z.number().int().nonnegative().default(0),
    status: enums_1.commonStatusEnum.default('ENABLED'),
});
exports.updateSystemSchema = zod_1.z.object({
    code: zod_1.z.string().min(1).max(32).regex(exports.codePattern).optional(),
    name: zod_1.z.string().min(1).max(32).optional(),
    sort: zod_1.z.number().int().nonnegative().optional(),
    status: enums_1.commonStatusEnum.optional(),
});
//# sourceMappingURL=system.js.map