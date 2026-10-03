"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dataScopeEnum = exports.menuTypeEnum = exports.commonStatusEnum = exports.userStatusEnum = void 0;
const zod_1 = require("zod");
exports.userStatusEnum = zod_1.z.enum(['ACTIVE', 'DISABLED']);
exports.commonStatusEnum = zod_1.z.enum(['ENABLED', 'DISABLED']);
exports.menuTypeEnum = zod_1.z.enum(['DIR', 'MENU', 'BUTTON']);
exports.dataScopeEnum = zod_1.z.enum(['ALL', 'DEPT_AND_SUB', 'DEPT', 'SELF']);
//# sourceMappingURL=enums.js.map