import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";
import { CONTAINER_ID_PATTERN } from "./policy";

/**
 * A public CA certificate is configuration, not a secret.
 * Private keys are never accepted. Do not persist them in integration_secrets.
 */

export const dockerConfigSchema = z
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

export const dockerSecretSchema = z.object({}).strict();

export const dockerContainerIdSchema = z.string().regex(CONTAINER_ID_PATTERN);

export const dockerListInputSchema = z.object({
  integrationId: z.uuid(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const dockerIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const dockerContainerInputSchema = z.object({
  integrationId: z.uuid(),
  containerId: dockerContainerIdSchema,
});

export const dockerLogsInputSchema = z.object({
  integrationId: z.uuid(),
  containerId: dockerContainerIdSchema,
  tail: z.number().int().min(1).max(500).default(200),
  sinceSeconds: z.number().int().min(0).max(86_400).optional(),
});

export const dockerActionInputSchema = z.object({
  integrationId: z.uuid(),
  containerId: dockerContainerIdSchema,
  timeoutSeconds: z.number().int().min(0).max(30).default(10),
});

export const dockerVersionResponseSchema = z
  .object({
    Version: z.string().min(1).max(64),
    ApiVersion: z.string().min(1).max(16),
    MinAPIVersion: z.string().min(1).max(16).optional(),
    Os: z.string().min(1).max(64).optional(),
    Arch: z.string().min(1).max(64).optional(),
  })
  .passthrough();

export const dockerPortSchema = z
  .object({
    PrivatePort: z.number().int().min(1).max(65535).optional(),
    PublicPort: z.number().int().min(1).max(65535).optional(),
    Type: z.string().optional(),
    IP: z.string().optional(),
  })
  .passthrough();

export const dockerContainerSummarySchema = z
  .object({
    Id: z.string(),
    Names: z.array(z.string()).optional(),
    Image: z.string().optional(),
    Created: z.number().optional(),
    State: z.string().optional(),
    Status: z.string().optional(),
  })
  .passthrough();

export const dockerContainerListSchema = z.array(dockerContainerSummarySchema).max(200);

export const dockerInspectSchema = z
  .object({
    Id: z.string(),
    Name: z.string().optional(),
    Image: z.string().optional(),
    Created: z.string().optional(),
    RestartCount: z.number().optional(),
    State: z
      .object({
        Status: z.string().optional(),
        StartedAt: z.string().optional(),
        FinishedAt: z.string().optional(),
        Health: z
          .object({
            Status: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    Config: z
      .object({
        Image: z.string().optional(),
        Tty: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    NetworkSettings: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const dockerStatsSchema = z
  .object({
    id: z.string().optional(),
    Id: z.string().optional(),
    cpu_stats: z.object({}).passthrough().optional(),
    precpu_stats: z.object({}).passthrough().optional(),
    memory_stats: z.object({}).passthrough().optional(),
    networks: z.record(z.string(), z.object({}).passthrough()).optional(),
    blkio_stats: z.object({}).passthrough().optional(),
  })
  .passthrough();

export type DockerConfig = z.infer<typeof dockerConfigSchema>;
export type DockerSecrets = z.infer<typeof dockerSecretSchema>;
