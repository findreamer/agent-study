import { z } from 'zod';

export type ApiOk<T> = { code: 0; data: T; message: string };

export const apiOkSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    code: z.literal(0),
    data,
    message: z.string(),
  });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  keyword: z.string().trim().min(1).optional(),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

export const pagedSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
  });
export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
