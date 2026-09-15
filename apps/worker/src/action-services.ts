import {
  MemoryIntegrationCache,
  MemorySafeActionInFlightGuard,
  MemorySafeActionRateLimiter,
  createIntegrationRegistry,
  secureRequest,
  type IntegrationStore,
} from "@dashboard/integrations";
import {
  MemoryNtfyOverviewCoalescer,
  MemoryNtfyRefreshFence,
  MemoryNtfyRefreshRateLimiter,
  createNtfyService,
  ntfyIntegrationDefinition,
} from "@dashboard/ntfy";
import {
  MemoryQbittorrentOverviewCoalescer,
  MemoryQbittorrentRefreshFence,
  MemoryQbittorrentRefreshRateLimiter,
  createQbittorrentService,
  qbittorrentIntegrationDefinition,
} from "@dashboard/qbittorrent";
import {
  MemorySonarrOverviewCoalescer,
  MemorySonarrRefreshFence,
  MemorySonarrRefreshRateLimiter,
  createSonarrService,
  sonarrIntegrationDefinition,
} from "@dashboard/sonarr";
import {
  MemoryRadarrOverviewCoalescer,
  MemoryRadarrRefreshFence,
  MemoryRadarrRefreshRateLimiter,
  createRadarrService,
  radarrIntegrationDefinition,
} from "@dashboard/radarr";
import { createEnvKeyring } from "@dashboard/secrets";
import type { EventBus } from "@dashboard/events";
import type { WorkerActionServices } from "./actions";

export function createWorkerActionServices(options: {
  store: IntegrationStore;
  bus: EventBus;
  secretEncryptionKey?: string;
}): WorkerActionServices {
  const registry = createIntegrationRegistry()
    .register(ntfyIntegrationDefinition)
    .register(qbittorrentIntegrationDefinition)
    .register(sonarrIntegrationDefinition)
    .register(radarrIntegrationDefinition)
    .freeze();
  const cache = new MemoryIntegrationCache();
  const keyring = createEnvKeyring(options.secretEncryptionKey);
  const occurredAt = () => new Date().toISOString();
  const publish = (integrationType: "ntfy" | "qbittorrent" | "sonarr" | "radarr") => {
    return (integrationId: string) =>
      options.bus.publish({
        type: "integration.data.changed",
        integrationId,
        integrationType,
        occurredAt: occurredAt(),
      });
  };
  return {
    ntfy: createNtfyService({
      store: options.store,
      registry,
      cache,
      request: secureRequest,
      refreshRateLimiter: new MemoryNtfyRefreshRateLimiter(),
      refreshFence: new MemoryNtfyRefreshFence(),
      overviewCoalescer: new MemoryNtfyOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      publish: publish("ntfy"),
      ...(keyring ? { keyring } : {}),
    }),
    qbittorrent: createQbittorrentService({
      store: options.store,
      registry,
      cache,
      request: secureRequest,
      refreshRateLimiter: new MemoryQbittorrentRefreshRateLimiter(),
      refreshFence: new MemoryQbittorrentRefreshFence(),
      overviewCoalescer: new MemoryQbittorrentOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      publish: publish("qbittorrent"),
      ...(keyring ? { keyring } : {}),
    }),
    sonarr: createSonarrService({
      store: options.store,
      registry,
      cache,
      request: secureRequest,
      refreshRateLimiter: new MemorySonarrRefreshRateLimiter(),
      refreshFence: new MemorySonarrRefreshFence(),
      overviewCoalescer: new MemorySonarrOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      publish: publish("sonarr"),
      ...(keyring ? { keyring } : {}),
    }),
    radarr: createRadarrService({
      store: options.store,
      registry,
      cache,
      request: secureRequest,
      refreshRateLimiter: new MemoryRadarrRefreshRateLimiter(),
      refreshFence: new MemoryRadarrRefreshFence(),
      overviewCoalescer: new MemoryRadarrOverviewCoalescer(),
      actionRateLimiter: new MemorySafeActionRateLimiter(),
      inFlight: new MemorySafeActionInFlightGuard(),
      publish: publish("radarr"),
      ...(keyring ? { keyring } : {}),
    }),
  };
}
