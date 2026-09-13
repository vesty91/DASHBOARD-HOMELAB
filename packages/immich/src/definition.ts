import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  type ConnectionResult,
  type IntegrationDefinition,
  type IntegrationErrorCode,
} from "@dashboard/integrations";
import { immichContextFromIntegration, testImmichConnection } from "./client";
import { ImmichError, toIntegrationError } from "./errors";
import {
  immichConfigSchema,
  immichSecretSchema,
  type ImmichConfig,
  type ImmichSecrets,
} from "./schemas";

export const IMMICH_INTEGRATION_ID = "immich";
export const IMMICH_INTEGRATION_VERSION = 1;
export const IMMICH_CAPABILITIES = ["server.read", "stats.read", "storage.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof ImmichError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof ImmichError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Immich connection test failed";
}

export function createImmichIntegrationDefinition(): IntegrationDefinition<
  ImmichConfig,
  ImmichSecrets
> {
  const definition: IntegrationDefinition<ImmichConfig, ImmichSecrets> = {
    id: IMMICH_INTEGRATION_ID,
    displayName: "Immich",
    version: IMMICH_INTEGRATION_VERSION,
    description: "Serveur, stockage et statistiques Immich via l'API officielle.",
    configSchema: immichConfigSchema,
    secretSchema: immichSecretSchema,
    capabilities: IMMICH_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Immich",
        required: true,
        valueSchema: z
          .string()
          .min(1)
          .max(512)
          .refine(
            (value) => !/[^\u0021-\u007E]/u.test(value),
            "Immich API key must be visible ASCII",
          ),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testImmichConnection(immichContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: metadata.version ? { version: metadata.version } : {},
        };
      } catch (error) {
        return {
          ok: false,
          code: connectionCode(error),
          message: connectionMessage(error),
        };
      }
    },
  };
  return definition;
}

export const immichIntegrationDefinition = createImmichIntegrationDefinition();

export const IMMICH_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
