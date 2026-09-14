import { z } from "zod";
import { parseSecretEncryptionKey } from "@dashboard/secrets";

const redisUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "redis:" || protocol === "rediss:";
}, "REDIS_URL must use the redis or rediss protocol");

const httpServiceUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "WORKER_URL and REALTIME_URL must use http or https");

export const serverEnvSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(32).optional(),
  AUTH_SESSION_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(2_592_000).default(86_400),
  SECRET_ENCRYPTION_KEY: z
    .string()
    .optional()
    .superRefine((value, context) => {
      if (value === undefined || value.trim() === "") return;
      try {
        parseSecretEncryptionKey(value);
      } catch {
        context.addIssue({
          code: "custom",
          message: "SECRET_ENCRYPTION_KEY must be base64 decoding to exactly 32 bytes",
        });
      }
    }),
  DB_DRIVER: z.enum(["sqlite", "postgres"]).optional(),
  DATABASE_URL: z.string().trim().min(1).optional(),
  REDIS_URL: redisUrlSchema.optional(),
  WORKER_URL: httpServiceUrlSchema.optional(),
  REALTIME_URL: httpServiceUrlSchema.optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  INTEGRATION_DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).optional(),
  BACKUP_DIR: z.string().trim().min(1).max(4096).optional(),
  APP_VERSION: z.string().trim().min(1).max(64).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(
  environment: Readonly<Record<string, string | undefined>>,
): ServerEnv {
  return serverEnvSchema.parse(environment);
}

export function getAuthSessionConfiguration(environment: ServerEnv) {
  const maxAge = environment.AUTH_SESSION_MAX_AGE_SECONDS;
  return { maxAge, updateAge: Math.min(3600, Math.floor(maxAge / 4)) };
}

export const serverEnv = parseServerEnv(process.env);

export const APP_VERSION = process.env.APP_VERSION?.trim() || "0.1.0";

export function assertRuntimeProductionEnv(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (environment.NODE_ENV !== "production") return;
  if (environment.NEXT_PHASE === "phase-production-build") return;
  if (environment.npm_lifecycle_event === "build") return;
  const missing: string[] = [];
  if (!environment.AUTH_SECRET || environment.AUTH_SECRET.length < 32) missing.push("AUTH_SECRET");
  if (!environment.DATABASE_URL?.trim()) missing.push("DATABASE_URL");
  if (environment.DB_DRIVER !== "postgres") missing.push("DB_DRIVER");
  if (!environment.SECRET_ENCRYPTION_KEY?.trim()) missing.push("SECRET_ENCRYPTION_KEY");
  if (!environment.APP_URL?.trim()) missing.push("APP_URL");
  if (missing.length > 0) throw new Error(`PRODUCTION_ENV_INVALID:${missing.join(",")}`);
  parseServerEnv(environment);
}
