import { z } from 'zod';
import type { CommonStatus } from './enums';
export declare const createDepartmentSchema: z.ZodObject<{
    parentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodString;
    leader: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sort: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["ENABLED", "DISABLED"]>>;
}, "strip", z.ZodTypeAny, {
    sort: number;
    name: string;
    status: "DISABLED" | "ENABLED";
    parentId?: string | null | undefined;
    leader?: string | null | undefined;
}, {
    name: string;
    sort?: number | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
    parentId?: string | null | undefined;
    leader?: string | null | undefined;
}>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export declare const updateDepartmentSchema: z.ZodObject<{
    parentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    name: z.ZodOptional<z.ZodString>;
    leader: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sort: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["ENABLED", "DISABLED"]>>;
}, "strip", z.ZodTypeAny, {
    sort?: number | undefined;
    name?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
    parentId?: string | null | undefined;
    leader?: string | null | undefined;
}, {
    sort?: number | undefined;
    name?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
    parentId?: string | null | undefined;
    leader?: string | null | undefined;
}>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type DepartmentNode = {
    id: string;
    parentId: string | null;
    name: string;
    leader: string | null;
    sort: number;
    status: CommonStatus;
    children?: DepartmentNode[];
};
export declare const departmentNodeSchema: z.ZodType<DepartmentNode>;
