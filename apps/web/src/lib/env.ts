import { z } from "zod";

const redisUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "redis:" || protocol === "rediss:";
}, "REDIS_URL must use the redis or rediss protocol");

export const serverEnvSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).optional(),
  SECRET_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
  DB_DRIVER: z.enum(["sqlite", "postgres"]).optional(),
  DATABASE_URL: z.string().trim().min(1).optional(),
  REDIS_URL: redisUrlSchema.optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  INTEGRATION_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  environment: Readonly<Record<string, string | undefined>>,
): ServerEnv {
  return serverEnvSchema.parse(environment);
}

export const serverEnv = parseServerEnv(process.env);
