"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pagedSchema = exports.listQuerySchema = exports.apiOkSchema = void 0;
const zod_1 = require("zod");
const apiOkSchema = (data) => zod_1.z.object({
    code: zod_1.z.literal(0),
    data,
    message: zod_1.z.string(),
});
exports.apiOkSchema = apiOkSchema;
exports.listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    keyword: zod_1.z.string().trim().min(1).optional(),
});
const pagedSchema = (item) => zod_1.z.object({
    items: zod_1.z.array(item),
    total: zod_1.z.number().int().nonnegative(),
    page: zod_1.z.number().int().positive(),
    pageSize: zod_1.z.number().int().positive(),
});
exports.pagedSchema = pagedSchema;
//# sourceMappingURL=common.js.map