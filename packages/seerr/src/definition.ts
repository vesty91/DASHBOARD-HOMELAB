import { performance } from "node:perf_hooks";
import {
  DEFAULT_TIMEOUT_MS,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  type ConnectionResult,
  type IntegrationDefinition,
  type IntegrationErrorCode,
} from "@dashboard/integrations";
import { seerrContextFromIntegration, testSeerrConnection } from "./client";
import { SeerrError, toIntegrationError } from "./errors";
import {
  seerrApiKeySchema,
  seerrConfigSchema,
  seerrSecretSchema,
  type SeerrConfig,
  type SeerrSecrets,
} from "./schemas";

export const SEERR_INTEGRATION_ID = "seerr";
export const SEERR_INTEGRATION_VERSION = 1;
export const SEERR_CAPABILITIES = ["status.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof SeerrError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof SeerrError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Seerr connection test failed";
}

export function createSeerrIntegrationDefinition(): IntegrationDefinition<
  SeerrConfig,
  SeerrSecrets
> {
  const definition: IntegrationDefinition<SeerrConfig, SeerrSecrets> = {
    id: SEERR_INTEGRATION_ID,
    displayName: "Seerr",
    version: SEERR_INTEGRATION_VERSION,
    description:
      "Version et compteurs de demandes Seerr via l'API officielle v1 en lecture seule (compatible Jellyseerr et Overseerr).",
    configSchema: seerrConfigSchema,
    secretSchema: seerrSecretSchema,
    capabilities: SEERR_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Seerr",
        required: true,
        valueSchema: seerrApiKeySchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testSeerrConnection(seerrContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.version ? { version: metadata.version } : {}),
            ...(metadata.compatibleProduct
              ? { compatibleProduct: metadata.compatibleProduct }
              : {}),
          },
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

export const seerrIntegrationDefinition = createSeerrIntegrationDefinition();

export const SEERR_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
