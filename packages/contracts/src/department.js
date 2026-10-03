"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.departmentNodeSchema = exports.updateDepartmentSchema = exports.createDepartmentSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
exports.createDepartmentSchema = zod_1.z.object({
    parentId: zod_1.z.string().nullable().optional(),
    name: zod_1.z.string().min(1).max(32),
    leader: zod_1.z.string().max(32).nullable().optional(),
    sort: zod_1.z.number().int().nonnegative().default(0),
    status: enums_1.commonStatusEnum.default('ENABLED'),
});
exports.updateDepartmentSchema = zod_1.z.object({
    parentId: zod_1.z.string().nullable().optional(),
    name: zod_1.z.string().min(1).max(32).optional(),
    leader: zod_1.z.string().max(32).nullable().optional(),
    sort: zod_1.z.number().int().nonnegative().optional(),
    status: enums_1.commonStatusEnum.optional(),
});
exports.departmentNodeSchema = zod_1.z.object({
    id: zod_1.z.string(),
    parentId: zod_1.z.string().nullable(),
    name: zod_1.z.string(),
    leader: zod_1.z.string().nullable(),
    sort: zod_1.z.number(),
    status: enums_1.commonStatusEnum,
    children: zod_1.z.lazy(() => zod_1.z.array(exports.departmentNodeSchema)).optional(),
});
//# sourceMappingURL=department.js.map