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
import { customApiContextFromIntegration, testCustomApiConnection } from "./client";
import { CustomApiError, toIntegrationError } from "./errors";
import {
  customApiConfigSchema,
  customApiSecretSchema,
  customApiVisibleAsciiSchema,
  type CustomApiConfig,
  type CustomApiSecrets,
} from "./schemas";

export const CUSTOM_API_INTEGRATION_ID = "custom-api";
export const CUSTOM_API_INTEGRATION_VERSION = 1;
export const CUSTOM_API_CAPABILITIES = ["status.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof CustomApiError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof CustomApiError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Custom API connection test failed";
}

export function createCustomApiIntegrationDefinition(): IntegrationDefinition<
  CustomApiConfig,
  CustomApiSecrets
> {
  const definition: IntegrationDefinition<CustomApiConfig, CustomApiSecrets> = {
    id: CUSTOM_API_INTEGRATION_ID,
    displayName: "API personnalisée",
    version: CUSTOM_API_INTEGRATION_VERSION,
    description:
      "GET JSON borné vers une allowlist d'endpoints déclarés. Aucun proxy générique, aucun chemin arbitraire.",
    configSchema: customApiConfigSchema,
    secretSchema: customApiSecretSchema,
    capabilities: CUSTOM_API_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
      { key: "apiKeyHeader", label: "En-tête de clé API", required: false },
      { key: "endpoints", label: "Endpoints autorisés (JSON)", required: true },
    ],
    secretFields: [
      {
        key: "bearerToken",
        label: "Jeton Bearer (optionnel)",
        required: false,
        valueSchema: customApiVisibleAsciiSchema,
      },
      {
        key: "apiKey",
        label: "Clé API (optionnelle)",
        required: false,
        valueSchema: customApiVisibleAsciiSchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testCustomApiConnection(customApiContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: { probedEndpointKey: metadata.endpointKey, json: true },
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

export const customApiIntegrationDefinition = createCustomApiIntegrationDefinition();

export const CUSTOM_API_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
