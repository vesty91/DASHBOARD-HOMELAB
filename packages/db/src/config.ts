import { z } from "zod";
const sqliteConfig = z.object({
  DB_DRIVER: z.literal("sqlite"),
  DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !value.includes("\0"), "Invalid SQLite path"),
});
const postgresConfig = z.object({
  DB_DRIVER: z.literal("postgres"),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      "DATABASE_URL must use postgres or postgresql",
    ),
});
export const databaseConfigSchema = z.discriminatedUnion("DB_DRIVER", [
  sqliteConfig,
  postgresConfig,
]);
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export function parseDatabaseConfig(
  environment: Readonly<Record<string, string | undefined>>,
): DatabaseConfig {
  return databaseConfigSchema.parse(environment);
}
