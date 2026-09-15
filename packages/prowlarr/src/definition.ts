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
import { prowlarrContextFromIntegration, testProwlarrConnection } from "./client";
import { ProwlarrError, toIntegrationError } from "./errors";
import {
  prowlarrApiKeySchema,
  prowlarrConfigSchema,
  prowlarrSecretSchema,
  type ProwlarrConfig,
  type ProwlarrSecrets,
} from "./schemas";

export const PROWLARR_INTEGRATION_ID = "prowlarr";
export const PROWLARR_INTEGRATION_VERSION = 1;
export const PROWLARR_CAPABILITIES = ["status.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof ProwlarrError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof ProwlarrError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Prowlarr connection test failed";
}

export function createProwlarrIntegrationDefinition(): IntegrationDefinition<
  ProwlarrConfig,
  ProwlarrSecrets
> {
  const definition: IntegrationDefinition<ProwlarrConfig, ProwlarrSecrets> = {
    id: PROWLARR_INTEGRATION_ID,
    displayName: "Prowlarr",
    version: PROWLARR_INTEGRATION_VERSION,
    description: "Version, indexeurs et santé Prowlarr via l'API officielle v1 en lecture seule.",
    configSchema: prowlarrConfigSchema,
    secretSchema: prowlarrSecretSchema,
    capabilities: PROWLARR_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Prowlarr",
        required: true,
        valueSchema: prowlarrApiKeySchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testProwlarrConnection(prowlarrContextFromIntegration(ctx));
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

export const prowlarrIntegrationDefinition = createProwlarrIntegrationDefinition();

export const PROWLARR_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
