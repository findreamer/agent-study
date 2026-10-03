"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequirementResultSchema = exports.RequirementSchema = void 0;
const zod_1 = require("zod");
exports.RequirementSchema = zod_1.z.object({
    input: zod_1.z.string().min(1),
});
exports.RequirementResultSchema = zod_1.z.object({
    action: zod_1.z.string().describe("唯一核心动作"),
    constraints: zod_1.z.array(zod_1.z.string()).describe("明确约束条件"),
    entities: zod_1.z.array(zod_1.z.string()).describe("关键实体"),
});
//# sourceMappingURL=requirement.js.map