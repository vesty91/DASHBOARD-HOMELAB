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
import { synologyContextFromIntegration, testSynologyConnection } from "./client";
import { SynologyError, toIntegrationError } from "./errors";
import {
  synologyConfigSchema,
  synologySecretSchema,
  type SynologyConfig,
  type SynologySecrets,
} from "./schemas";

export const SYNOLOGY_INTEGRATION_ID = "synology";
export const SYNOLOGY_INTEGRATION_VERSION = 1;
export const SYNOLOGY_CAPABILITIES = ["system.read", "resources.read", "storage.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof SynologyError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof SynologyError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Synology connection test failed";
}

export function createSynologyIntegrationDefinition(): IntegrationDefinition<
  SynologyConfig,
  SynologySecrets
> {
  const definition: IntegrationDefinition<SynologyConfig, SynologySecrets> = {
    id: SYNOLOGY_INTEGRATION_ID,
    displayName: "Synology DSM",
    version: SYNOLOGY_INTEGRATION_VERSION,
    description: "Informations système, ressources et stockage d'un NAS Synology via l'API DSM.",
    configSchema: synologyConfigSchema,
    secretSchema: synologySecretSchema,
    capabilities: SYNOLOGY_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "account", label: "Compte DSM", required: true },
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "password",
        label: "Mot de passe DSM",
        required: true,
        valueSchema: z.string().min(1).max(256),
      },
      {
        key: "deviceId",
        label: "Appareil de confiance DSM",
        required: false,
        serverManaged: true,
        valueSchema: z.string().min(1).max(256),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testSynologyConnection(synologyContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.model ? { model: metadata.model } : {}),
            ...(metadata.dsmVersion ? { dsmVersion: metadata.dsmVersion } : {}),
            ...(metadata.uptimeSeconds === null ? {} : { uptimeSeconds: metadata.uptimeSeconds }),
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

export const synologyIntegrationDefinition = createSynologyIntegrationDefinition();

export const SYNOLOGY_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
