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
import { proxmoxContextFromIntegration, testProxmoxConnection } from "./client";
import { ProxmoxError, toIntegrationError } from "./errors";
import {
  proxmoxApiTokenSchema,
  proxmoxConfigSchema,
  proxmoxSecretSchema,
  type ProxmoxConfig,
  type ProxmoxSecrets,
} from "./schemas";

export const PROXMOX_INTEGRATION_ID = "proxmox";
export const PROXMOX_INTEGRATION_VERSION = 1;
export const PROXMOX_CAPABILITIES = [
  "cluster.read",
  "guests.start",
  "guests.shutdown",
  "guests.reboot",
] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof ProxmoxError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof ProxmoxError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "Proxmox connection test failed";
}

export function createProxmoxIntegrationDefinition(): IntegrationDefinition<
  ProxmoxConfig,
  ProxmoxSecrets
> {
  const definition: IntegrationDefinition<ProxmoxConfig, ProxmoxSecrets> = {
    id: PROXMOX_INTEGRATION_ID,
    displayName: "Proxmox VE",
    version: PROXMOX_INTEGRATION_VERSION,
    description: "Nœuds, VMs, CTs et stockage Proxmox VE via l'API officielle.",
    configSchema: proxmoxConfigSchema,
    secretSchema: proxmoxSecretSchema,
    capabilities: PROXMOX_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "apiToken",
        label: "Jeton API Proxmox (USER@REALM!TOKENID=SECRET)",
        required: true,
        valueSchema: proxmoxApiTokenSchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testProxmoxConnection(proxmoxContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            ...(metadata.version ? { version: metadata.version } : {}),
            ...(metadata.release ? { release: metadata.release } : {}),
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

export const proxmoxIntegrationDefinition = createProxmoxIntegrationDefinition();

export const PROXMOX_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
