import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

export const ntfyAccessTokenSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "ntfy access token must be visible ASCII");

export const ntfyConfigSchema = z
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

export const ntfySecretSchema = z
  .object({
    accessToken: ntfyAccessTokenSchema.optional(),
  })
  .transform((data) => (data.accessToken === undefined ? {} : { accessToken: data.accessToken }));

export const ntfyIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export type NtfyConfig = z.infer<typeof ntfyConfigSchema>;
export type NtfySecrets = z.infer<typeof ntfySecretSchema>;
