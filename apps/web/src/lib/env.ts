import { z } from "zod";

const serverEnvSchema = z.object({
  APP_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export const serverEnv = serverEnvSchema.parse({
  APP_URL: process.env.APP_URL,
  LOG_LEVEL: process.env.LOG_LEVEL,
});
