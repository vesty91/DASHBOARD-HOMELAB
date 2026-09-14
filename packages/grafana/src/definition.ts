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
import { grafanaContextFromIntegration, testGrafanaConnection } from "./client";
import { GrafanaError, toIntegrationError } from "./errors";
import {
  grafanaConfigSchema,
  grafanaSecretSchema,
  grafanaServiceAccountTokenSchema,
  type GrafanaConfig,
  type GrafanaSecrets,
} from "./schemas";

export const GRAFANA_INTEGRATION_ID = "grafana";
export const GRAFANA_INTEGRATION_VERSION = 1;
export const GRAFANA_CAPABILITIES = ["status.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof GrafanaError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof GrafanaError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Grafana connection test failed";
}

export function createGrafanaIntegrationDefinition(): IntegrationDefinition<
  GrafanaConfig,
  GrafanaSecrets
> {
  const definition: IntegrationDefinition<GrafanaConfig, GrafanaSecrets> = {
    id: GRAFANA_INTEGRATION_ID,
    displayName: "Grafana",
    version: GRAFANA_INTEGRATION_VERSION,
    description:
      "Santé, tableaux de bord, alertes et sources Grafana via l'API officielle en lecture seule.",
    configSchema: grafanaConfigSchema,
    secretSchema: grafanaSecretSchema,
    capabilities: GRAFANA_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "serviceAccountToken",
        label: "Jeton de compte de service Grafana",
        required: true,
        valueSchema: grafanaServiceAccountTokenSchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testGrafanaConnection(grafanaContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.version ? { version: metadata.version } : {}),
            database: metadata.database,
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

export const grafanaIntegrationDefinition = createGrafanaIntegrationDefinition();

export const GRAFANA_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
