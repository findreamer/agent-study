import { z } from 'zod';
export declare const roleBriefSchema: z.ZodObject<{
    id: z.ZodString;
    systemId: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    status: z.ZodEnum<["ENABLED", "DISABLED"]>;
    priority: z.ZodNumber;
    dataScope: z.ZodEnum<["ALL", "DEPT_AND_SUB", "DEPT", "SELF"]>;
    remark: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    systemId: string;
    priority: number;
    dataScope: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF";
    remark: string | null;
}, {
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    systemId: string;
    priority: number;
    dataScope: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF";
    remark: string | null;
}>;
export type RoleBrief = z.infer<typeof roleBriefSchema>;
export declare const roleDetailSchema: z.ZodObject<{
    id: z.ZodString;
    systemId: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    status: z.ZodEnum<["ENABLED", "DISABLED"]>;
    priority: z.ZodNumber;
    dataScope: z.ZodEnum<["ALL", "DEPT_AND_SUB", "DEPT", "SELF"]>;
    remark: z.ZodNullable<z.ZodString>;
} & {
    menuIds: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    createdAt: string;
    updatedAt: string;
    systemId: string;
    priority: number;
    dataScope: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF";
    remark: string | null;
    menuIds: string[];
}, {
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    createdAt: string;
    updatedAt: string;
    systemId: string;
    priority: number;
    dataScope: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF";
    remark: string | null;
    menuIds: string[];
}>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export declare const createRoleSchema: z.ZodObject<{
    systemId: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    status: z.ZodDefault<z.ZodEnum<["ENABLED", "DISABLED"]>>;
    priority: z.ZodDefault<z.ZodNumber>;
    dataScope: z.ZodDefault<z.ZodEnum<["ALL", "DEPT_AND_SUB", "DEPT", "SELF"]>>;
    remark: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    menuIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    systemId: string;
    priority: number;
    dataScope: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF";
    menuIds: string[];
    remark?: string | null | undefined;
}, {
    name: string;
    code: string;
    systemId: string;
    status?: "DISABLED" | "ENABLED" | undefined;
    priority?: number | undefined;
    dataScope?: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF" | undefined;
    remark?: string | null | undefined;
    menuIds?: string[] | undefined;
}>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export declare const updateRoleSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["ENABLED", "DISABLED"]>>;
    priority: z.ZodOptional<z.ZodNumber>;
    dataScope: z.ZodOptional<z.ZodEnum<["ALL", "DEPT_AND_SUB", "DEPT", "SELF"]>>;
    remark: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    menuIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    code?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
    priority?: number | undefined;
    dataScope?: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF" | undefined;
    remark?: string | null | undefined;
    menuIds?: string[] | undefined;
}, {
    name?: string | undefined;
    code?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
    priority?: number | undefined;
    dataScope?: "ALL" | "DEPT_AND_SUB" | "DEPT" | "SELF" | undefined;
    remark?: string | null | undefined;
    menuIds?: string[] | undefined;
}>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export declare const roleListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    keyword: z.ZodOptional<z.ZodString>;
} & {
    systemId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    systemId: string;
    keyword?: string | undefined;
}, {
    systemId: string;
    page?: number | undefined;
    pageSize?: number | undefined;
    keyword?: string | undefined;
}>;
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
