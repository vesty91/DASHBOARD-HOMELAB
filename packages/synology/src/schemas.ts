import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

const accountSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((value) => !/[\u0000-\u001F\u007F]/u.test(value), "account contains control characters");

export const synologyConfigSchema = z
  .object({
    account: accountSchema,
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
      account: data.account,
      verifyTls: data.verifyTls,
      timeoutMs: data.timeoutMs,
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const synologySecretSchema = z.object({
  password: z.string().min(1).max(256),
  deviceId: z.string().min(1).max(256).optional(),
});

export const synologyIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const synologyEnrollDeviceSchema = z.object({
  integrationId: z.uuid(),
  otpCode: z.string().regex(/^\d{4,8}$/u),
});

export const dsmEnvelopeSchema = z
  .object({
    success: z.boolean(),
    data: z.unknown().optional(),
    error: z
      .object({
        code: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const dsmApiInfoEntrySchema = z
  .object({
    path: z.string().min(1).max(64),
    minVersion: z.number().int().min(1).max(32).optional(),
    maxVersion: z.number().int().min(1).max(32).optional(),
    requestFormat: z.string().max(32).optional(),
  })
  .passthrough();

export const dsmApiInfoSchema = z.record(z.string(), dsmApiInfoEntrySchema);

export const dsmAuthDataSchema = z
  .object({
    sid: z.string().min(1).max(256),
    synotoken: z.string().min(1).max(256).optional(),
    SynoToken: z.string().min(1).max(256).optional(),
    did: z.string().min(1).max(256).optional(),
    device_id: z.string().min(1).max(256).optional(),
  })
  .passthrough();

export type SynologyConfig = z.infer<typeof synologyConfigSchema>;
export type SynologySecrets = z.infer<typeof synologySecretSchema>;
