import { analyzeImpact, type ImpactAnalysis, type ImpactStatus } from "./impact";
import type { TopologyStorePort } from "./ports";

export type DependencyImpactChangedEvent = {
  type: "dependency.impact.changed";
  serviceKey: string;
  impactStatus: ImpactStatus;
  candidateRootCause: string | null;
  occurredAt: string;
};

/**
 * Diff previous vs next impact maps.
 * Empty previous + seedIfEmpty → seed snapshot without emitting (worker restart safe).
 */
export function diffImpactTransitions(input: {
  previous: ReadonlyMap<string, ImpactStatus>;
  next: ImpactAnalysis;
  occurredAt: string;
  seedIfEmpty?: boolean;
}): {
  events: DependencyImpactChangedEvent[];
  nextSnapshot: Map<string, ImpactStatus>;
} {
  const nextSnapshot = new Map<string, ImpactStatus>();
  for (const service of input.next.services) {
    nextSnapshot.set(service.serviceKey, service.impactStatus);
  }
  for (const key of input.previous.keys()) {
    if (!nextSnapshot.has(key)) nextSnapshot.set(key, "none");
  }

  if (input.previous.size === 0 && input.seedIfEmpty !== false) {
    return { events: [], nextSnapshot };
  }

  const keys = new Set<string>([...input.previous.keys(), ...nextSnapshot.keys()]);
  const events: DependencyImpactChangedEvent[] = [];
  for (const serviceKey of keys) {
    const previous = input.previous.get(serviceKey) ?? "none";
    const impactStatus = nextSnapshot.get(serviceKey) ?? "none";
    if (previous === impactStatus) continue;
    events.push({
      type: "dependency.impact.changed",
      serviceKey,
      impactStatus,
      candidateRootCause: input.next.candidateRootCause,
      occurredAt: input.occurredAt,
    });
  }
  return { events, nextSnapshot };
}

export async function computeImpactAnalysis(store: TopologyStorePort): Promise<ImpactAnalysis> {
  const [edges, integrationIds, unavailable] = await Promise.all([
    store.listDependencies({ limit: 1_000 }),
    store.listIntegrationIds(500),
    store.listOpenUnavailableServiceKeys(),
  ]);
  const unavailableSet = new Set(unavailable);
  const actualByService = new Map<string, "available" | "unavailable" | "unknown">();
  for (const id of integrationIds) {
    actualByService.set(id, unavailableSet.has(id) ? "unavailable" : "available");
  }
  for (const edge of edges) {
    if (!actualByService.has(edge.upstreamServiceKey)) {
      actualByService.set(edge.upstreamServiceKey, "unknown");
    }
    if (!actualByService.has(edge.downstreamServiceKey)) {
      actualByService.set(edge.downstreamServiceKey, "unknown");
    }
  }
  return analyzeImpact({ edges, actualByService });
}

export function createImpactEventReconciler(deps: {
  store: TopologyStorePort;
  publishEvent: (event: DependencyImpactChangedEvent) => Promise<void>;
  snapshot?: Map<string, ImpactStatus>;
  dryRun?: boolean;
}) {
  const snapshot = deps.snapshot ?? new Map<string, ImpactStatus>();

  return {
    /** Current in-memory snapshot (for tests). */
    getSnapshot(): ReadonlyMap<string, ImpactStatus> {
      return snapshot;
    },

    async reconcile(input?: {
      occurredAt?: string;
      seedIfEmpty?: boolean;
    }): Promise<{ emitted: number; events: DependencyImpactChangedEvent[] }> {
      const occurredAt = input?.occurredAt ?? new Date().toISOString();
      const analysis = await computeImpactAnalysis(deps.store);
      const { events, nextSnapshot } = diffImpactTransitions({
        previous: snapshot,
        next: analysis,
        occurredAt,
        ...(input?.seedIfEmpty !== undefined ? { seedIfEmpty: input.seedIfEmpty } : {}),
      });
      snapshot.clear();
      for (const [key, status] of nextSnapshot) snapshot.set(key, status);
      if (!deps.dryRun) {
        for (const event of events) {
          await deps.publishEvent(event);
        }
      }
      return { emitted: events.length, events };
    },
  };
}

export type ImpactEventReconciler = ReturnType<typeof createImpactEventReconciler>;
