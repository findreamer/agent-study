import { z } from 'zod';

const ttlSchema = z
  .string()
  .regex(/^\d+[smhd]$/, 'TTL must look like 30m, 12h or 1d')
  .transform((value): number => {
    const unit = value.slice(-1);
    const amount = Number(value.slice(0, -1));
    const factors = { s: 1, m: 60, h: 3600, d: 86400 } as const;
    return amount * factors[unit as keyof typeof factors];
  });

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  JWT_AT_TTL: ttlSchema.default('1d'),
  RT_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3003'),
  PORT: z.coerce.number().int().positive().default(4002),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  SEED_ADMIN_USERNAME: z.string().default('admin'),
  SEED_ADMIN_PASSWORD: z.string().default('Admin@123456'),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);

export const isProduction = env.NODE_ENV === 'production';
