import { z } from 'zod';
export type ApiOk<T> = {
    code: 0;
    data: T;
    message: string;
};
export declare const apiOkSchema: <T extends z.ZodTypeAny>(data: T) => z.ZodObject<{
    code: z.ZodLiteral<0>;
    data: T;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, z.objectUtil.addQuestionMarks<z.baseObjectOutputType<{
    code: z.ZodLiteral<0>;
    data: T;
    message: z.ZodString;
}>, any> extends infer T_1 ? { [k in keyof T_1]: T_1[k]; } : never, z.baseObjectInputType<{
    code: z.ZodLiteral<0>;
    data: T;
    message: z.ZodString;
}> extends infer T_2 ? { [k_1 in keyof T_2]: T_2[k_1]; } : never>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    pageSize: z.ZodDefault<z.ZodNumber>;
    keyword: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    keyword?: string | undefined;
}, {
    page?: number | undefined;
    pageSize?: number | undefined;
    keyword?: string | undefined;
}>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export declare const pagedSchema: <T extends z.ZodTypeAny>(item: T) => z.ZodObject<{
    items: z.ZodArray<T, "many">;
    total: z.ZodNumber;
    page: z.ZodNumber;
    pageSize: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    page: number;
    pageSize: number;
    items: T["_output"][];
    total: number;
}, {
    page: number;
    pageSize: number;
    items: T["_input"][];
    total: number;
}>;
export type Paged<T> = {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
};
