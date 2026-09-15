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
import { radarrContextFromIntegration, testRadarrConnection } from "./client";
import { RadarrError, toIntegrationError } from "./errors";
import {
  radarrApiKeySchema,
  radarrConfigSchema,
  radarrSecretSchema,
  type RadarrConfig,
  type RadarrSecrets,
} from "./schemas";

export const RADARR_INTEGRATION_ID = "radarr";
export const RADARR_INTEGRATION_VERSION = 1;
export const RADARR_CAPABILITIES = ["status.read", "command.queue"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof RadarrError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof RadarrError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Radarr connection test failed";
}

export function createRadarrIntegrationDefinition(): IntegrationDefinition<
  RadarrConfig,
  RadarrSecrets
> {
  const definition: IntegrationDefinition<RadarrConfig, RadarrSecrets> = {
    id: RADARR_INTEGRATION_ID,
    displayName: "Radarr",
    version: RADARR_INTEGRATION_VERSION,
    description:
      "Version, films, file d'attente Radarr et commandes ciblées (refresh film, recherche film) via l'API officielle v3.",
    configSchema: radarrConfigSchema,
    secretSchema: radarrSecretSchema,
    capabilities: RADARR_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Radarr",
        required: true,
        valueSchema: radarrApiKeySchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testRadarrConnection(radarrContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.version ? { version: metadata.version } : {}),
            ...(metadata.appName ? { appName: metadata.appName } : {}),
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

export const radarrIntegrationDefinition = createRadarrIntegrationDefinition();

export const RADARR_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
