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
import { dockerContextFromIntegration, pingDocker, readDockerVersion } from "./client";
import {
  dockerConfigSchema,
  dockerSecretSchema,
  type DockerConfig,
  type DockerSecrets,
} from "./schemas";

export const DOCKER_INTEGRATION_ID = "docker";
export const DOCKER_INTEGRATION_VERSION = 1;

export const DOCKER_CAPABILITIES = [
  "containers.read",
  "containers.stats",
  "containers.logs",
  "containers.start",
  "containers.stop",
  "containers.restart",
] as const;

function connectionCode(error: unknown): IntegrationErrorCode {
  return error instanceof IntegrationError ? error.code : "UNKNOWN";
}

export function createDockerIntegrationDefinition(): IntegrationDefinition<
  DockerConfig,
  DockerSecrets
> {
  const definition: IntegrationDefinition<DockerConfig, DockerSecrets> = {
    id: DOCKER_INTEGRATION_ID,
    displayName: "Docker",
    version: DOCKER_INTEGRATION_VERSION,
    description: "Docker Engine via un Docker Socket Proxy HTTP(S) restreint.",
    configSchema: dockerConfigSchema,
    secretSchema: dockerSecretSchema,
    capabilities: DOCKER_CAPABILITIES,
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "trustedCaPem", label: "CA de confiance (PEM)", required: false },
    ],
    secretFields: [],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx): Promise<ConnectionResult> {
      const started = performance.now();
      try {
        const dockerCtx = dockerContextFromIntegration(ctx);
        await pingDocker(dockerCtx);
        const version = await readDockerVersion(dockerCtx);
        return {
          ok: true,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
          metadata: {
            engineVersion: version.engineVersion,
            serverApiVersion: version.serverApiVersion,
            serverMinApiVersion: version.serverMinApiVersion,
            negotiatedApiVersion: version.negotiatedApiVersion,
            ...(version.os ? { os: version.os } : {}),
            ...(version.arch ? { arch: version.arch } : {}),
          },
        };
      } catch (error) {
        return {
          ok: false,
          code: connectionCode(error),
          message: error instanceof Error ? error.message : "Docker connection test failed",
        };
      }
    },
  };
  return definition;
}

export const dockerIntegrationDefinition = createDockerIntegrationDefinition();

export const DOCKER_TIMEOUT_BOUNDS = {
  min: MIN_TIMEOUT_MS,
  max: MAX_TIMEOUT_MS,
  defaultValue: DEFAULT_TIMEOUT_MS,
} as const;
