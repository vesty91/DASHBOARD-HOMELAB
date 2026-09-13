import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

const immichApiKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Immich API key must be visible ASCII");

export const immichConfigSchema = z
  .object({
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
      verifyTls: data.verifyTls,
      timeoutMs: data.timeoutMs,
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const immichSecretSchema = z.object({
  apiKey: immichApiKeySchema,
});

export const immichIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const immichVersionResponseSchema = z
  .object({
    major: z.number().int().min(0).max(999),
    minor: z.number().int().min(0).max(999),
    patch: z.number().int().min(0).max(999),
  })
  .passthrough();

export const immichAboutResponseSchema = z
  .object({
    version: z.string().max(64).optional(),
    licensed: z.boolean().optional(),
  })
  .passthrough();

export const immichPingResponseSchema = z
  .object({
    res: z.string().min(1).max(16),
  })
  .passthrough();

export const immichStorageResponseSchema = z
  .object({
    diskSizeRaw: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    diskUseRaw: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    diskAvailableRaw: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    diskUsagePercentage: z.number().finite().min(0).max(100),
  })
  .passthrough();

export const immichStatsResponseSchema = z
  .object({
    photos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    videos: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    usage: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  })
  .passthrough();

export type ImmichConfig = z.infer<typeof immichConfigSchema>;
export type ImmichSecrets = z.infer<typeof immichSecretSchema>;
