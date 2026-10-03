import { z } from 'zod';
export declare const codePattern: RegExp;
export declare const systemBriefSchema: z.ZodObject<{
    id: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    status: z.ZodEnum<["ENABLED", "DISABLED"]>;
    sort: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    sort: number;
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
}, {
    sort: number;
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
}>;
export type SystemBrief = z.infer<typeof systemBriefSchema>;
export declare const systemDetailSchema: z.ZodObject<{
    id: z.ZodString;
    code: z.ZodString;
    name: z.ZodString;
    status: z.ZodEnum<["ENABLED", "DISABLED"]>;
    sort: z.ZodNumber;
} & {
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    sort: number;
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    createdAt: string;
    updatedAt: string;
}, {
    sort: number;
    id: string;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
    createdAt: string;
    updatedAt: string;
}>;
export type SystemDetail = z.infer<typeof systemDetailSchema>;
export declare const createSystemSchema: z.ZodObject<{
    code: z.ZodString;
    name: z.ZodString;
    sort: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["ENABLED", "DISABLED"]>>;
}, "strip", z.ZodTypeAny, {
    sort: number;
    name: string;
    code: string;
    status: "DISABLED" | "ENABLED";
}, {
    name: string;
    code: string;
    sort?: number | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
}>;
export type CreateSystemInput = z.infer<typeof createSystemSchema>;
export declare const updateSystemSchema: z.ZodObject<{
    code: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["ENABLED", "DISABLED"]>>;
}, "strip", z.ZodTypeAny, {
    sort?: number | undefined;
    name?: string | undefined;
    code?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
}, {
    sort?: number | undefined;
    name?: string | undefined;
    code?: string | undefined;
    status?: "DISABLED" | "ENABLED" | undefined;
}>;
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;
