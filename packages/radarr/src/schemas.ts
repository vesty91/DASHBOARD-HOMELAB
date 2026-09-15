import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

export const radarrApiKeySchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Radarr API key must be visible ASCII");

export const radarrConfigSchema = z
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

export const radarrSecretSchema = z.object({
  apiKey: radarrApiKeySchema,
});

export const radarrIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

const radarrResourceIdSchema = z.number().int().positive().max(2_147_483_647);

export const radarrRefreshMovieInputSchema = z.object({
  integrationId: z.uuid(),
  movieId: radarrResourceIdSchema,
  expectedConfigRevision: z.number().int().positive().optional(),
});

export const radarrSearchMovieInputSchema = z.object({
  integrationId: z.uuid(),
  movieId: radarrResourceIdSchema,
  expectedConfigRevision: z.number().int().positive().optional(),
});

export type RadarrConfig = z.infer<typeof radarrConfigSchema>;
export type RadarrSecrets = z.infer<typeof radarrSecretSchema>;
export type RadarrRefreshMovieInput = z.infer<typeof radarrRefreshMovieInputSchema>;
export type RadarrSearchMovieInput = z.infer<typeof radarrSearchMovieInputSchema>;
