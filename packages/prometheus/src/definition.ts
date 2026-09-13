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
import { testPrometheusConnection, prometheusContextFromIntegration } from "./client";
import { PrometheusError, toIntegrationError } from "./errors";
import {
  prometheusConfigSchema,
  prometheusSecretSchema,
  visibleAscii,
  type PrometheusConfig,
  type PrometheusSecrets,
} from "./schemas";

export const PROMETHEUS_INTEGRATION_ID = "prometheus";
export const PROMETHEUS_INTEGRATION_VERSION = 1;
export const PROMETHEUS_CAPABILITIES = ["query.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof PrometheusError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof PrometheusError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Prometheus connection test failed";
}

export function createPrometheusIntegrationDefinition(): IntegrationDefinition<
  PrometheusConfig,
  PrometheusSecrets
> {
  const definition: IntegrationDefinition<PrometheusConfig, PrometheusSecrets> = {
    id: PROMETHEUS_INTEGRATION_ID,
    displayName: "Prometheus",
    version: PROMETHEUS_INTEGRATION_VERSION,
    description:
      "Requêtes PromQL bornées via l'API HTTP officielle POST /api/v1/query et /api/v1/query_range.",
    configSchema: prometheusConfigSchema,
    secretSchema: prometheusSecretSchema,
    capabilities: PROMETHEUS_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "bearerToken",
        label: "Jeton Bearer Prometheus (optionnel)",
        required: false,
        valueSchema: visibleAscii,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testPrometheusConnection(prometheusContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: { seriesCount: metadata.seriesCount },
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

export const prometheusIntegrationDefinition = createPrometheusIntegrationDefinition();

export const PROMETHEUS_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
