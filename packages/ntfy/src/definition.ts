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
import { ntfyContextFromIntegration, testNtfyConnection } from "./client";
import { NtfyError, toIntegrationError } from "./errors";
import {
  ntfyAccessTokenSchema,
  ntfyConfigSchema,
  ntfySecretSchema,
  type NtfyConfig,
  type NtfySecrets,
} from "./schemas";

export const NTFY_INTEGRATION_ID = "ntfy";
export const NTFY_INTEGRATION_VERSION = 1;
export const NTFY_CAPABILITIES = ["status.read", "notifications.publish"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof NtfyError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof NtfyError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "ntfy connection test failed";
}

export function createNtfyIntegrationDefinition(): IntegrationDefinition<NtfyConfig, NtfySecrets> {
  const definition: IntegrationDefinition<NtfyConfig, NtfySecrets> = {
    id: NTFY_INTEGRATION_ID,
    displayName: "ntfy",
    version: NTFY_INTEGRATION_VERSION,
    description:
      "Santé ntfy et publication ciblée via l'API officielle (topic, message, titre, priorité, tags bornés).",
    configSchema: ntfyConfigSchema,
    secretSchema: ntfySecretSchema,
    capabilities: NTFY_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "accessToken",
        label: "Jeton d'accès ntfy",
        required: false,
        valueSchema: ntfyAccessTokenSchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testNtfyConnection(ntfyContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: { healthy: metadata.healthy },
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

export const ntfyIntegrationDefinition = createNtfyIntegrationDefinition();

export const NTFY_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
