import { z } from 'zod';
export declare const userBriefSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    nickname: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["ACTIVE", "DISABLED"]>;
    isSuperadmin: z.ZodBoolean;
    departmentId: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "ACTIVE" | "DISABLED";
    username: string;
    nickname: string;
    email: string | null;
    isSuperadmin: boolean;
    departmentId: string | null;
}, {
    id: string;
    status: "ACTIVE" | "DISABLED";
    username: string;
    nickname: string;
    email: string | null;
    isSuperadmin: boolean;
    departmentId: string | null;
}>;
export type UserBrief = z.infer<typeof userBriefSchema>;
export declare const userDetailSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    nickname: z.ZodString;
    email: z.ZodNullable<z.ZodString>;
    status: z.ZodEnum<["ACTIVE", "DISABLED"]>;
    isSuperadmin: z.ZodBoolean;
    departmentId: z.ZodNullable<z.ZodString>;
} & {
    departmentName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodArray<z.ZodString, "many">;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    status: "ACTIVE" | "DISABLED";
    createdAt: string;
    updatedAt: string;
    username: string;
    nickname: string;
    email: string | null;
    isSuperadmin: boolean;
    departmentId: string | null;
    roleIds: string[];
    departmentName?: string | null | undefined;
}, {
    id: string;
    status: "ACTIVE" | "DISABLED";
    createdAt: string;
    updatedAt: string;
    username: string;
    nickname: string;
    email: string | null;
    isSuperadmin: boolean;
    departmentId: string | null;
    roleIds: string[];
    departmentName?: string | null | undefined;
}>;
export type UserDetail = z.infer<typeof userDetailSchema>;
export declare const createUserSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
    nickname: z.ZodString;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    departmentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    username: string;
    nickname: string;
    roleIds: string[];
    password: string;
    email?: string | null | undefined;
    departmentId?: string | null | undefined;
}, {
    username: string;
    nickname: string;
    password: string;
    email?: string | null | undefined;
    departmentId?: string | null | undefined;
    roleIds?: string[] | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export declare const updateUserSchema: z.ZodObject<{
    nickname: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "DISABLED"]>>;
    departmentId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    roleIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    status?: "ACTIVE" | "DISABLED" | undefined;
    nickname?: string | undefined;
    email?: string | null | undefined;
    departmentId?: string | null | undefined;
    roleIds?: string[] | undefined;
}, {
    status?: "ACTIVE" | "DISABLED" | undefined;
    nickname?: string | undefined;
    email?: string | null | undefined;
    departmentId?: string | null | undefined;
    roleIds?: string[] | undefined;
}>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export declare const resetPasswordSchema: z.ZodObject<{
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    newPassword: string;
}, {
    newPassword: string;
}>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export declare const userListQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    keyword: z.ZodOptional<z.ZodString>;
} & {
    departmentId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    keyword?: string | undefined;
    departmentId?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    keyword?: string | undefined;
    departmentId?: string | undefined;
}>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
