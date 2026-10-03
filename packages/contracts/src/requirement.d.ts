import { z } from "zod";
export declare const RequirementSchema: z.ZodObject<{
    input: z.ZodString;
}, "strip", z.ZodTypeAny, {
    input: string;
}, {
    input: string;
}>;
export declare const RequirementResultSchema: z.ZodObject<{
    action: z.ZodString;
    constraints: z.ZodArray<z.ZodString, "many">;
    entities: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    action: string;
    constraints: string[];
    entities: string[];
}, {
    action: string;
    constraints: string[];
    entities: string[];
}>;
export type RequirementResult = z.infer<typeof RequirementResultSchema>;
