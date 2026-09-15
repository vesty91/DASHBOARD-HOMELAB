import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

export const qbittorrentUsernameSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (value) => !/[^\u0021-\u007E]/u.test(value),
    "qBittorrent username must be visible ASCII",
  );

export const qbittorrentPasswordSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => !/[^\u0021-\u007E]/u.test(value),
    "qBittorrent password must be visible ASCII",
  );

export const qbittorrentConfigSchema = z
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

export const qbittorrentSecretSchema = z.object({
  username: qbittorrentUsernameSchema,
  password: qbittorrentPasswordSchema,
});

export const qbittorrentIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export type QbittorrentConfig = z.infer<typeof qbittorrentConfigSchema>;
export type QbittorrentSecrets = z.infer<typeof qbittorrentSecretSchema>;
