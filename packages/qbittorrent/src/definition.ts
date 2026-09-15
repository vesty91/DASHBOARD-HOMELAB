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
import { qbittorrentContextFromIntegration, testQbittorrentConnection } from "./client";
import { QbittorrentError, toIntegrationError } from "./errors";
import {
  qbittorrentConfigSchema,
  qbittorrentPasswordSchema,
  qbittorrentSecretSchema,
  qbittorrentUsernameSchema,
  type QbittorrentConfig,
  type QbittorrentSecrets,
} from "./schemas";

export const QBITTORRENT_INTEGRATION_ID = "qbittorrent";
export const QBITTORRENT_INTEGRATION_VERSION = 1;
export const QBITTORRENT_CAPABILITIES = [
  "status.read",
  "torrents.pause",
  "torrents.resume",
] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  if (error instanceof QbittorrentError) return toIntegrationError(error).code;
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

function connectionMessage(error: unknown): string {
  if (error instanceof QbittorrentError || error instanceof IntegrationError) return error.message;
  return error instanceof Error ? error.message : "qBittorrent connection test failed";
}

export function createQbittorrentIntegrationDefinition(): IntegrationDefinition<
  QbittorrentConfig,
  QbittorrentSecrets
> {
  const definition: IntegrationDefinition<QbittorrentConfig, QbittorrentSecrets> = {
    id: QBITTORRENT_INTEGRATION_ID,
    displayName: "qBittorrent",
    version: QBITTORRENT_INTEGRATION_VERSION,
    description:
      "Débits, compteurs et pause/reprise ciblés de torrents qBittorrent via l'API WebUI officielle v2.",
    configSchema: qbittorrentConfigSchema,
    secretSchema: qbittorrentSecretSchema,
    capabilities: QBITTORRENT_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [
      {
        key: "username",
        label: "Identifiant qBittorrent",
        required: true,
        valueSchema: qbittorrentUsernameSchema,
      },
      {
        key: "password",
        label: "Mot de passe qBittorrent",
        required: true,
        valueSchema: qbittorrentPasswordSchema,
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const metadata = await testQbittorrentConnection(qbittorrentContextFromIntegration(ctx));
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
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

export const qbittorrentIntegrationDefinition = createQbittorrentIntegrationDefinition();

export const QBITTORRENT_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
