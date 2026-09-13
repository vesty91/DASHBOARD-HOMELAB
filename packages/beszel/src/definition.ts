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
import { beszelContextFromIntegration, testBeszelConnection } from "./client";
import { BeszelError, toIntegrationError } from "./errors";
import {
  beszelConfigSchema,
  beszelSecretSchema,
  type BeszelConfig,
  type BeszelSecrets,
} from "./schemas";

export const BESZEL_INTEGRATION_ID = "beszel";
export const BESZEL_INTEGRATION_VERSION = 1;
export const BESZEL_CAPABILITIES = ["hosts.read"] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof BeszelError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof BeszelError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Beszel connection test failed";
}

export function createBeszelIntegrationDefinition(): IntegrationDefinition<
  BeszelConfig,
  BeszelSecrets
> {
  const definition: IntegrationDefinition<BeszelConfig, BeszelSecrets> = {
    id: BESZEL_INTEGRATION_ID,
    displayName: "Beszel",
    version: BESZEL_INTEGRATION_VERSION,
    description: "Hosts et métriques Beszel via l'API PocketBase officielle.",
    configSchema: beszelConfigSchema,
    secretSchema: beszelSecretSchema,
    capabilities: BESZEL_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "identity", label: "Identifiant Beszel", required: true },
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "password",
        label: "Mot de passe Beszel",
        required: true,
        valueSchema: z
          .string()
          .min(1)
          .max(512)
          .refine(
            (value) => !/[^\u0021-\u007E]/u.test(value),
            "Beszel password must be visible ASCII",
          ),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testBeszelConnection(beszelContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: { hostCount: metadata.hostCount },
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

export const beszelIntegrationDefinition = createBeszelIntegrationDefinition();

export const BESZEL_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
