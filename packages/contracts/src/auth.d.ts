import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    username: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    password: string;
}, {
    username: string;
    password: string;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const switchSystemSchema: z.ZodObject<{
    systemCode: z.ZodString;
}, "strip", z.ZodTypeAny, {
    systemCode: string;
}, {
    systemCode: string;
}>;
export type SwitchSystemInput = z.infer<typeof switchSystemSchema>;
export declare const changePasswordSchema: z.ZodEffects<z.ZodObject<{
    oldPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    newPassword: string;
    oldPassword: string;
}, {
    newPassword: string;
    oldPassword: string;
}>, {
    newPassword: string;
    oldPassword: string;
}, {
    newPassword: string;
    oldPassword: string;
}>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export declare const profileResponseSchema: z.ZodObject<{
    user: z.ZodObject<{
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
    currentSystemCode: z.ZodString;
    systems: z.ZodArray<z.ZodObject<{
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
    }>, "many">;
    menus: z.ZodArray<z.ZodType<import("./menu").MenuNode, z.ZodTypeDef, import("./menu").MenuNode>, "many">;
    permissions: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    user: {
        id: string;
        status: "ACTIVE" | "DISABLED";
        username: string;
        nickname: string;
        email: string | null;
        isSuperadmin: boolean;
        departmentId: string | null;
    };
    currentSystemCode: string;
    systems: {
        sort: number;
        id: string;
        name: string;
        code: string;
        status: "DISABLED" | "ENABLED";
    }[];
    menus: import("./menu").MenuNode[];
    permissions: string[];
}, {
    user: {
        id: string;
        status: "ACTIVE" | "DISABLED";
        username: string;
        nickname: string;
        email: string | null;
        isSuperadmin: boolean;
        departmentId: string | null;
    };
    currentSystemCode: string;
    systems: {
        sort: number;
        id: string;
        name: string;
        code: string;
        status: "DISABLED" | "ENABLED";
    }[];
    menus: import("./menu").MenuNode[];
    permissions: string[];
}>;
export type ProfileResponse = z.infer<typeof profileResponseSchema>;
export declare const loginResponseSchema: z.ZodObject<{
    accessToken: z.ZodString;
    profile: z.ZodObject<{
        user: z.ZodObject<{
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
        currentSystemCode: z.ZodString;
        systems: z.ZodArray<z.ZodObject<{
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
        }>, "many">;
        menus: z.ZodArray<z.ZodType<import("./menu").MenuNode, z.ZodTypeDef, import("./menu").MenuNode>, "many">;
        permissions: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        user: {
            id: string;
            status: "ACTIVE" | "DISABLED";
            username: string;
            nickname: string;
            email: string | null;
            isSuperadmin: boolean;
            departmentId: string | null;
        };
        currentSystemCode: string;
        systems: {
            sort: number;
            id: string;
            name: string;
            code: string;
            status: "DISABLED" | "ENABLED";
        }[];
        menus: import("./menu").MenuNode[];
        permissions: string[];
    }, {
        user: {
            id: string;
            status: "ACTIVE" | "DISABLED";
            username: string;
            nickname: string;
            email: string | null;
            isSuperadmin: boolean;
            departmentId: string | null;
        };
        currentSystemCode: string;
        systems: {
            sort: number;
            id: string;
            name: string;
            code: string;
            status: "DISABLED" | "ENABLED";
        }[];
        menus: import("./menu").MenuNode[];
        permissions: string[];
    }>;
}, "strip", z.ZodTypeAny, {
    accessToken: string;
    profile: {
        user: {
            id: string;
            status: "ACTIVE" | "DISABLED";
            username: string;
            nickname: string;
            email: string | null;
            isSuperadmin: boolean;
            departmentId: string | null;
        };
        currentSystemCode: string;
        systems: {
            sort: number;
            id: string;
            name: string;
            code: string;
            status: "DISABLED" | "ENABLED";
        }[];
        menus: import("./menu").MenuNode[];
        permissions: string[];
    };
}, {
    accessToken: string;
    profile: {
        user: {
            id: string;
            status: "ACTIVE" | "DISABLED";
            username: string;
            nickname: string;
            email: string | null;
            isSuperadmin: boolean;
            departmentId: string | null;
        };
        currentSystemCode: string;
        systems: {
            sort: number;
            id: string;
            name: string;
            code: string;
            status: "DISABLED" | "ENABLED";
        }[];
        menus: import("./menu").MenuNode[];
        permissions: string[];
    };
}>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export declare const refreshResponseSchema: z.ZodObject<{
    accessToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    accessToken: string;
}, {
    accessToken: string;
}>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export declare const sessionInfoSchema: z.ZodObject<{
    familyId: z.ZodString;
    userAgent: z.ZodNullable<z.ZodString>;
    ip: z.ZodNullable<z.ZodString>;
    lastUsedAt: z.ZodNullable<z.ZodString>;
    current: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    familyId: string;
    userAgent: string | null;
    ip: string | null;
    lastUsedAt: string | null;
    current: boolean;
}, {
    familyId: string;
    userAgent: string | null;
    ip: string | null;
    lastUsedAt: string | null;
    current: boolean;
}>;
export type SessionInfo = z.infer<typeof sessionInfoSchema>;
