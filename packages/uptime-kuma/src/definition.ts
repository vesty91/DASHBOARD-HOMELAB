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
import { testUptimeKumaConnection, uptimeKumaContextFromIntegration } from "./client";
import { UptimeKumaError, toIntegrationError } from "./errors";
import {
  uptimeKumaConfigSchema,
  uptimeKumaSecretSchema,
  type UptimeKumaConfig,
  type UptimeKumaSecrets,
} from "./schemas";

export const UPTIME_KUMA_INTEGRATION_ID = "uptime-kuma";
export const UPTIME_KUMA_INTEGRATION_VERSION = 1;
export const UPTIME_KUMA_CAPABILITIES = ["monitors.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof UptimeKumaError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof UptimeKumaError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Uptime Kuma connection test failed";
}

export function createUptimeKumaIntegrationDefinition(): IntegrationDefinition<
  UptimeKumaConfig,
  UptimeKumaSecrets
> {
  const definition: IntegrationDefinition<UptimeKumaConfig, UptimeKumaSecrets> = {
    id: UPTIME_KUMA_INTEGRATION_ID,
    displayName: "Uptime Kuma",
    version: UPTIME_KUMA_INTEGRATION_VERSION,
    description:
      "Statut des moniteurs Uptime Kuma via l'exposition Prometheus officielle /metrics.",
    configSchema: uptimeKumaConfigSchema,
    secretSchema: uptimeKumaSecretSchema,
    capabilities: UPTIME_KUMA_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Uptime Kuma",
        required: true,
        valueSchema: z
          .string()
          .min(1)
          .max(512)
          .refine(
            (value) => !/[^\u0021-\u007E]/u.test(value),
            "Uptime Kuma API key must be visible ASCII",
          ),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testUptimeKumaConnection(uptimeKumaContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: { monitorCount: metadata.monitorCount },
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

export const uptimeKumaIntegrationDefinition = createUptimeKumaIntegrationDefinition();

export const UPTIME_KUMA_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
