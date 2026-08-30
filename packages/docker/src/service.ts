import {
  DEFAULT_TIMEOUT_MS,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  requireCapability,
  type IntegrationCache,
  type IntegrationRateLimiter,
  type IntegrationRegistry,
  type IntegrationStore,
  type JsonObject,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { assertDockerAccess, dockerPermissionsView } from "./access";
import { assertDockerContainerId } from "./policy";
import {
  CONTAINER_CACHE_TTL_MS,
  dockerGetJson,
  dockerGetLogs,
  dockerPostAction,
  inspectTty,
  readDockerVersion,
  VERSION_CACHE_TTL_MS,
  type DockerClientContext,
} from "./client";
import { DOCKER_INTEGRATION_ID } from "./definition";
import {
  boundStatusText,
  computeUptimeSeconds,
  createdAtFromUnix,
  mapInspectPorts,
  mapListPorts,
  normalizeContainerNames,
  normalizeContainerState,
  normalizeHealthStatus,
  normalizePrimaryName,
  parseDockerTimestamp,
  shortContainerId,
} from "./dto";
import { recognizeDockerImage } from "./recognition";
import { dockerContainerListSchema, dockerInspectSchema, dockerStatsSchema } from "./schemas";
import { mapContainerStats } from "./stats";
import type {
  DockerActionResult,
  DockerActor,
  DockerContainerDetail,
  DockerContainerStats,
  DockerContainerSummary,
  DockerLogResult,
  DockerPermissionsView,
  DockerSystemInfo,
} from "./types";

const VERSION_OPERATION = "docker.version";
const LIST_OPERATION = "docker.containers.list";
const INSPECT_PREFIX = "docker.containers.inspect:";
const STATS_PREFIX = "docker.containers.stats:";

interface CachedDockerInspect {
  readonly detail: DockerContainerDetail;
  readonly tty: boolean;
}

function dockerPayloadContainerId(value: {
  id?: string | undefined;
  Id?: string | undefined;
}): string | null {
  const raw = value.id ?? value.Id;
  if (typeof raw !== "string") return null;
  const id = raw.trim().toLocaleLowerCase("und");
  return /^[a-f0-9]{64}$/u.test(id) ? id : null;
}

export interface DockerServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  actionRateLimiter: IntegrationRateLimiter;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
}

function timeoutFromConfig(config: JsonObject): number {
  const raw = config.timeoutMs;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

function verifyTlsFromConfig(config: JsonObject): boolean {
  return config.verifyTls !== false;
}

function cachedValue<T>(
  cache: IntegrationCache,
  integrationId: string,
  operation: string,
): T | undefined {
  return cache.get(integrationId, operation) as T | undefined;
}

export function createDockerService(deps: DockerServiceDeps) {
  async function loadDocker(
    integrationId: string,
    capability: string,
  ): Promise<{
    ctx: DockerClientContext;
    recordId: string;
  }> {
    const record = await deps.store.findById(integrationId);
    if (!record) throw new IntegrationError("NOT_FOUND", "Integration not found");
    if (record.type !== DOCKER_INTEGRATION_ID)
      throw new IntegrationError("MISCONFIGURED", "Integration is not a Docker adapter");
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Docker integration is disabled");
    const definition = deps.registry.get(DOCKER_INTEGRATION_ID);
    if (!definition)
      throw new IntegrationError("MISCONFIGURED", "Docker definition is not registered");
    const parsed = definition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Docker configuration");
    requireCapability(definition.capabilities, capability);
    const config = parsed.data as JsonObject;
    return {
      recordId: record.id,
      ctx: {
        baseUrl: record.baseUrl,
        verifyTls: verifyTlsFromConfig(config),
        timeoutMs: timeoutFromConfig(config),
        request: (options) =>
          deps.request({
            ...options,
            verifyTls: options.verifyTls ?? verifyTlsFromConfig(config),
            timeoutMs: options.timeoutMs ?? timeoutFromConfig(config),
            allowedSchemes: options.allowedSchemes ?? definition.allowedSchemes,
            maxRetries: 0,
            maxRedirects: 0,
          }),
      },
    };
  }

  async function negotiatedVersion(
    ctx: DockerClientContext,
    integrationId: string,
  ): Promise<DockerSystemInfo> {
    const cached = cachedValue<DockerSystemInfo>(deps.cache, integrationId, VERSION_OPERATION);
    if (cached) return cached;
    const version = await readDockerVersion(ctx);
    deps.cache.set(integrationId, VERSION_OPERATION, version, VERSION_CACHE_TTL_MS);
    return version;
  }

  function versionedPath(version: string, suffix: string): string {
    return `/v${version}${suffix}`;
  }

  function mapSummary(raw: unknown): DockerContainerSummary | null {
    if (!raw || typeof raw !== "object") return null;
    const record = raw as Record<string, unknown>;
    const id = typeof record.Id === "string" ? record.Id.trim().toLocaleLowerCase("und") : "";
    if (!/^[a-f0-9]{64}$/u.test(id)) return null;
    const names = normalizeContainerNames(Array.isArray(record.Names) ? record.Names : []);
    const image = typeof record.Image === "string" ? record.Image : "";
    const state = normalizeContainerState(
      typeof record.State === "string" ? record.State : undefined,
    );
    return {
      id,
      shortId: shortContainerId(id),
      names,
      image,
      createdAt: createdAtFromUnix(typeof record.Created === "number" ? record.Created : undefined),
      state,
      statusText: boundStatusText(typeof record.Status === "string" ? record.Status : undefined),
      ports: mapListPorts(record.Ports),
      health: "none",
      recognizedApp: recognizeDockerImage(image),
    };
  }

  function mapDetail(raw: unknown): DockerContainerDetail {
    const parsed = dockerInspectSchema.safeParse(raw);
    if (!parsed.success)
      throw new IntegrationError("INVALID_RESPONSE", "Docker inspect payload is invalid");
    const id = parsed.data.Id.trim().toLocaleLowerCase("und");
    if (!/^[a-f0-9]{64}$/u.test(id))
      throw new IntegrationError(
        "INVALID_RESPONSE",
        "Docker inspect returned an invalid container id",
      );
    const names = normalizeContainerNames(parsed.data.Name ? [parsed.data.Name] : []);
    const image = parsed.data.Config?.Image ?? parsed.data.Image ?? "";
    const state = normalizeContainerState(parsed.data.State?.Status);
    const startedAt = parseDockerTimestamp(parsed.data.State?.StartedAt);
    const finishedAt = parseDockerTimestamp(parsed.data.State?.FinishedAt);
    return {
      id,
      shortId: shortContainerId(id),
      name: normalizePrimaryName(parsed.data.Name, names) || shortContainerId(id),
      image,
      state,
      health: normalizeHealthStatus(
        parsed.data.State?.Health?.Status,
        Boolean(parsed.data.State?.Health),
      ),
      startedAt,
      finishedAt,
      restartCount:
        typeof parsed.data.RestartCount === "number" && Number.isFinite(parsed.data.RestartCount)
          ? parsed.data.RestartCount
          : null,
      uptimeSeconds: computeUptimeSeconds(state, startedAt),
      ports: mapInspectPorts(parsed.data.NetworkSettings),
      recognizedApp: recognizeDockerImage(image),
    };
  }

  async function inspectCached(
    ctx: DockerClientContext,
    integrationId: string,
    containerId: string,
    version: string,
  ): Promise<CachedDockerInspect> {
    const operation = `${INSPECT_PREFIX}${containerId}`;
    const cached = cachedValue<CachedDockerInspect>(deps.cache, integrationId, operation);
    if (cached) return cached;
    const result = await dockerGetJson(
      ctx,
      versionedPath(version, `/containers/${containerId}/json`),
    );
    const detail = mapDetail(result.body);
    if (detail.id !== containerId)
      throw new IntegrationError(
        "INVALID_RESPONSE",
        "Docker inspect returned a different container id",
      );
    const sanitized: CachedDockerInspect = Object.freeze({
      detail: Object.freeze(detail),
      tty: inspectTty(result.body),
    });
    deps.cache.set(integrationId, operation, sanitized, CONTAINER_CACHE_TTL_MS);
    return sanitized;
  }

  async function consumeAction(actor: DockerActor, integrationId: string): Promise<void> {
    if (!deps.actionRateLimiter.tryConsume(actor.userId ?? "anonymous", integrationId))
      throw new IntegrationError("RATE_LIMITED", "Too many Docker actions");
  }

  return {
    permissions(actor: DockerActor): DockerPermissionsView {
      return dockerPermissionsView(actor);
    },
    async getSystem(integrationId: string, actor: DockerActor): Promise<DockerSystemInfo> {
      assertDockerAccess(actor, "read");
      const loaded = await loadDocker(integrationId, "containers.read");
      return negotiatedVersion(loaded.ctx, loaded.recordId);
    },
    async listContainers(
      input: { integrationId: string; limit?: number | undefined },
      actor: DockerActor,
    ): Promise<readonly DockerContainerSummary[]> {
      assertDockerAccess(actor, "read");
      const loaded = await loadDocker(input.integrationId, "containers.read");
      const limit = input.limit ?? 100;
      const operation = `${LIST_OPERATION}:${limit}`;
      const cached = cachedValue<readonly DockerContainerSummary[]>(
        deps.cache,
        loaded.recordId,
        operation,
      );
      if (cached) return cached;
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const search = new URLSearchParams({ all: "true", limit: String(limit) });
      const result = await dockerGetJson(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, "/containers/json"),
        search,
      );
      const parsed = dockerContainerListSchema.safeParse(result.body);
      if (!parsed.success)
        throw new IntegrationError("INVALID_RESPONSE", "Docker container list is invalid");
      const items = Object.freeze(
        parsed.data.map(mapSummary).filter((item): item is DockerContainerSummary => item !== null),
      );
      deps.cache.set(loaded.recordId, operation, items, CONTAINER_CACHE_TTL_MS);
      return items;
    },
    async getContainer(
      input: { integrationId: string; containerId: string },
      actor: DockerActor,
    ): Promise<DockerContainerDetail> {
      assertDockerAccess(actor, "read");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.read");
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      return (
        await inspectCached(
          loaded.ctx,
          loaded.recordId,
          input.containerId,
          version.negotiatedApiVersion,
        )
      ).detail;
    },
    async getContainerStats(
      input: { integrationId: string; containerId: string },
      actor: DockerActor,
    ): Promise<DockerContainerStats> {
      assertDockerAccess(actor, "read");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.stats");
      const operation = `${STATS_PREFIX}${input.containerId}`;
      const cached = cachedValue<DockerContainerStats>(deps.cache, loaded.recordId, operation);
      if (cached) return cached;
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const search = new URLSearchParams({ stream: "false" });
      const result = await dockerGetJson(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, `/containers/${input.containerId}/stats`),
        search,
      );
      const parsed = dockerStatsSchema.safeParse(result.body);
      if (!parsed.success)
        throw new IntegrationError("INVALID_RESPONSE", "Docker stats payload is invalid");
      if (dockerPayloadContainerId(parsed.data) !== input.containerId)
        throw new IntegrationError(
          "INVALID_RESPONSE",
          "Docker stats returned a different container id",
        );
      const stats = mapContainerStats(parsed.data);
      deps.cache.set(loaded.recordId, operation, stats, CONTAINER_CACHE_TTL_MS);
      return stats;
    },
    async getContainerLogs(
      input: {
        integrationId: string;
        containerId: string;
        tail?: number | undefined;
        sinceSeconds?: number | undefined;
      },
      actor: DockerActor,
    ): Promise<DockerLogResult> {
      assertDockerAccess(actor, "logs");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.logs");
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const inspect = await inspectCached(
        loaded.ctx,
        loaded.recordId,
        input.containerId,
        version.negotiatedApiVersion,
      );
      const tail = input.tail ?? 200;
      const search = new URLSearchParams({
        stdout: "true",
        stderr: "true",
        timestamps: "true",
        tail: String(tail),
      });
      if (input.sinceSeconds !== undefined) {
        const since = Math.max(0, Math.floor(Date.now() / 1000) - input.sinceSeconds);
        search.set("since", String(since));
      }
      return dockerGetLogs(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, `/containers/${input.containerId}/logs`),
        search,
        inspect.tty,
      );
    },
    async startContainer(
      input: { integrationId: string; containerId: string },
      actor: DockerActor,
    ): Promise<DockerActionResult> {
      assertDockerAccess(actor, "start");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.start");
      await consumeAction(actor, loaded.recordId);
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const result = await dockerPostAction(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, `/containers/${input.containerId}/start`),
      );
      deps.cache.invalidate(loaded.recordId);
      return result;
    },
    async stopContainer(
      input: { integrationId: string; containerId: string; timeoutSeconds?: number | undefined },
      actor: DockerActor,
    ): Promise<DockerActionResult> {
      assertDockerAccess(actor, "stop");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.stop");
      await consumeAction(actor, loaded.recordId);
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const search = new URLSearchParams({ t: String(input.timeoutSeconds ?? 10) });
      const result = await dockerPostAction(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, `/containers/${input.containerId}/stop`),
        search,
      );
      deps.cache.invalidate(loaded.recordId);
      return result;
    },
    async restartContainer(
      input: { integrationId: string; containerId: string; timeoutSeconds?: number | undefined },
      actor: DockerActor,
    ): Promise<DockerActionResult> {
      assertDockerAccess(actor, "restart");
      assertDockerContainerId(input.containerId);
      const loaded = await loadDocker(input.integrationId, "containers.restart");
      await consumeAction(actor, loaded.recordId);
      const version = await negotiatedVersion(loaded.ctx, loaded.recordId);
      const search = new URLSearchParams({ t: String(input.timeoutSeconds ?? 10) });
      const result = await dockerPostAction(
        loaded.ctx,
        versionedPath(version.negotiatedApiVersion, `/containers/${input.containerId}/restart`),
        search,
      );
      deps.cache.invalidate(loaded.recordId);
      return result;
    },
  };
}

export type DockerService = ReturnType<typeof createDockerService>;
