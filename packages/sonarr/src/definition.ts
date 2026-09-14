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
import { sonarrContextFromIntegration, testSonarrConnection } from "./client";
import { SonarrError, toIntegrationError } from "./errors";
import {
  sonarrApiKeySchema,
  sonarrConfigSchema,
  sonarrSecretSchema,
  type SonarrConfig,
  type SonarrSecrets,
} from "./schemas";

export const SONARR_INTEGRATION_ID = "sonarr";
export const SONARR_INTEGRATION_VERSION = 1;
export const SONARR_CAPABILITIES = ["status.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof SonarrError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof SonarrError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Sonarr connection test failed";
}

export function createSonarrIntegrationDefinition(): IntegrationDefinition<
  SonarrConfig,
  SonarrSecrets
> {
  const definition: IntegrationDefinition<SonarrConfig, SonarrSecrets> = {
    id: SONARR_INTEGRATION_ID,
    displayName: "Sonarr",
    version: SONARR_INTEGRATION_VERSION,
    description:
      "Version, séries, file d'attente et santé Sonarr via l'API officielle v3 en lecture seule.",
    configSchema: sonarrConfigSchema,
    secretSchema: sonarrSecretSchema,
    capabilities: SONARR_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Sonarr",
        required: true,
        valueSchema: sonarrApiKeySchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testSonarrConnection(sonarrContextFromIntegration(ctx));
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

export const sonarrIntegrationDefinition = createSonarrIntegrationDefinition();

export const SONARR_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
