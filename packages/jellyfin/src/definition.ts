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
import { jellyfinContextFromIntegration, testJellyfinConnection } from "./client";
import { JellyfinError, toIntegrationError } from "./errors";
import {
  jellyfinConfigSchema,
  jellyfinSecretSchema,
  type JellyfinConfig,
  type JellyfinSecrets,
} from "./schemas";

export const JELLYFIN_INTEGRATION_ID = "jellyfin";
export const JELLYFIN_INTEGRATION_VERSION = 1;
export const JELLYFIN_CAPABILITIES = ["server.read", "sessions.read", "streams.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof JellyfinError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof JellyfinError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Jellyfin connection test failed";
}

export function createJellyfinIntegrationDefinition(): IntegrationDefinition<
  JellyfinConfig,
  JellyfinSecrets
> {
  const definition: IntegrationDefinition<JellyfinConfig, JellyfinSecrets> = {
    id: JELLYFIN_INTEGRATION_ID,
    displayName: "Jellyfin",
    version: JELLYFIN_INTEGRATION_VERSION,
    description: "Serveur, sessions et lectures Jellyfin via l'API officielle.",
    configSchema: jellyfinConfigSchema,
    secretSchema: jellyfinSecretSchema,
    capabilities: JELLYFIN_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "Clé API Jellyfin",
        required: true,
        valueSchema: z
          .string()
          .min(1)
          .max(512)
          .refine(
            (value) => !/[^\u0021-\u007E]/u.test(value),
            "Jellyfin API key must be visible ASCII",
          ),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testJellyfinConnection(jellyfinContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.serverName ? { serverName: metadata.serverName } : {}),
            ...(metadata.version ? { version: metadata.version } : {}),
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

export const jellyfinIntegrationDefinition = createJellyfinIntegrationDefinition();

export const JELLYFIN_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
