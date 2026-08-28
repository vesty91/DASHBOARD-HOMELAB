import { z } from "zod";

export const integrationUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .transform((value, context) => {
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error();
      return url.toString();
    } catch {
      context.addIssue({
        code: "custom",
        message: "A valid HTTP(S) URL without credentials is required",
      });
      return z.NEVER;
    }
  });

export const integrationCreateSchema = z.object({
  type: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  baseUrl: integrationUrlSchema,
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const integrationUpdateSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  baseUrl: integrationUrlSchema.optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export const integrationSetSecretSchema = z.object({
  integrationId: z.uuid(),
  key: z.string().trim().min(1).max(64),
  value: z.string().min(1).max(8192),
});

export type IntegrationCreateParsed = z.infer<typeof integrationCreateSchema>;
export type IntegrationUpdateParsed = z.infer<typeof integrationUpdateSchema>;
