import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

const visibleAscii = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Beszel secret must be visible ASCII");

export const beszelConfigSchema = z
  .object({
    identity: z.string().email().max(254),
    verifyTls: z.boolean().default(true),
    timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    trustedCaPem: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trustedCaPem === undefined || data.trustedCaPem.trim() === "") return;
    try {
      normalizeTrustedCaPem(data.trustedCaPem);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: error instanceof Error ? error.message : "Invalid trusted CA PEM",
      });
      return;
    }
    if (data.verifyTls === false) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: "trustedCaPem cannot be set when verifyTls is false",
      });
    }
  })
  .transform((data) => {
    const trustedCaPem =
      data.trustedCaPem === undefined || data.trustedCaPem.trim() === ""
        ? undefined
        : normalizeTrustedCaPem(data.trustedCaPem);
    return {
      identity: data.identity,
      verifyTls: data.verifyTls,
      timeoutMs: data.timeoutMs,
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const beszelSecretSchema = z.object({
  password: visibleAscii,
});

export const beszelIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const beszelAuthTokenSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Beszel token must be visible ASCII");

export const beszelAuthResponseSchema = z
  .object({
    token: beszelAuthTokenSchema,
  })
  .passthrough();

export const beszelHostStatusSchema = z.enum(["up", "down", "paused", "pending"]);

export const beszelSystemInfoSchema = z
  .object({
    cpu: z.number().finite().min(0).max(100).optional(),
    mp: z.number().finite().min(0).max(100).optional(),
    dp: z.number().finite().min(0).max(100).optional(),
    bb: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    v: z.string().max(64).optional(),
  })
  .passthrough();

export const beszelSystemRecordSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(200),
    host: z.string().max(256).optional(),
    status: beszelHostStatusSchema,
    info: beszelSystemInfoSchema.optional(),
    updated: z.string().max(64).optional(),
  })
  .passthrough();

export const beszelSystemsPageSchema = z
  .object({
    page: z.number().int().min(1).max(10_000),
    perPage: z.number().int().min(1).max(200),
    totalPages: z.number().int().min(0).max(10_000).optional(),
    items: z.array(beszelSystemRecordSchema),
  })
  .passthrough();

export type BeszelConfig = z.infer<typeof beszelConfigSchema>;
export type BeszelSecrets = z.infer<typeof beszelSecretSchema>;
