import {
  TOPOLOGY_MAX_DEPTH,
  TOPOLOGY_MAX_NODES,
  buildDownstreamAdjacency,
  type DependencyEdge,
} from "./cycle";

export const ACTUAL_STATUSES = ["available", "unavailable", "unknown"] as const;
export type ActualStatus = (typeof ACTUAL_STATUSES)[number];

export const IMPACT_STATUSES = ["none", "at-risk", "impacted"] as const;
export type ImpactStatus = (typeof IMPACT_STATUSES)[number];

export type ServiceImpactView = {
  serviceKey: string;
  actualStatus: ActualStatus;
  impactStatus: ImpactStatus;
};

export type ImpactAnalysis = {
  services: ServiceImpactView[];
  /** Heuristic only — never asserted as definitive root cause. */
  candidateRootCause: string | null;
  truncated: boolean;
};

function rankImpact(a: ImpactStatus, b: ImpactStatus): ImpactStatus {
  const order: Record<ImpactStatus, number> = { none: 0, "at-risk": 1, impacted: 2 };
  return order[a] >= order[b] ? a : b;
}

/**
 * Compute impactStatus separately from actualStatus.
 * Does not mutate or overwrite actual status.
 */
export function analyzeImpact(input: {
  edges: readonly DependencyEdge[];
  actualByService: ReadonlyMap<string, ActualStatus>;
  maxDepth?: number;
  maxNodes?: number;
}): ImpactAnalysis {
  const maxDepth = input.maxDepth ?? TOPOLOGY_MAX_DEPTH;
  const maxNodes = input.maxNodes ?? TOPOLOGY_MAX_NODES;
  const adjacency = buildDownstreamAdjacency(input.edges);

  const serviceKeys = new Set<string>();
  for (const key of input.actualByService.keys()) serviceKeys.add(key);
  for (const edge of input.edges) {
    serviceKeys.add(edge.upstreamServiceKey);
    serviceKeys.add(edge.downstreamServiceKey);
  }

  const impactByService = new Map<string, ImpactStatus>();
  for (const key of serviceKeys) impactByService.set(key, "none");

  let truncated = false;
  const unavailableSources: string[] = [];

  for (const [key, actual] of input.actualByService) {
    if (actual === "unavailable") unavailableSources.push(key);
  }

  for (const source of unavailableSources) {
    const queue: Array<{ key: string; depth: number }> = [{ key: source, depth: 0 }];
    const visited = new Set<string>();
    let visitedCount = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.key)) continue;
      visited.add(current.key);
      visitedCount += 1;
      if (visitedCount > maxNodes || current.depth > maxDepth) {
        truncated = true;
        break;
      }
      if (current.depth > 0) {
        impactByService.set(
          current.key,
          rankImpact(impactByService.get(current.key) ?? "none", "impacted"),
        );
      }
      for (const child of adjacency.get(current.key) ?? []) {
        queue.push({ key: child, depth: current.depth + 1 });
      }
    }
  }

  // Unknown upstream → direct dependents at-risk (if not already impacted).
  for (const [key, actual] of input.actualByService) {
    if (actual !== "unknown") continue;
    for (const child of adjacency.get(key) ?? []) {
      impactByService.set(child, rankImpact(impactByService.get(child) ?? "none", "at-risk"));
    }
  }

  let candidateRootCause: string | null = null;
  let bestScore = -1;
  for (const source of unavailableSources) {
    let score = 0;
    const queue = [...(adjacency.get(source) ?? [])];
    const seen = new Set<string>();
    while (queue.length > 0) {
      const key = queue.shift()!;
      if (seen.has(key)) continue;
      seen.add(key);
      if (impactByService.get(key) === "impacted") score += 1;
      for (const child of adjacency.get(key) ?? []) queue.push(child);
    }
    if (score > bestScore) {
      bestScore = score;
      candidateRootCause = source;
    }
  }
  if (unavailableSources.length === 0) candidateRootCause = null;

  const services: ServiceImpactView[] = [...serviceKeys]
    .sort((a, b) => a.localeCompare(b))
    .map((serviceKey) => ({
      serviceKey,
      actualStatus: input.actualByService.get(serviceKey) ?? "unknown",
      impactStatus: impactByService.get(serviceKey) ?? "none",
    }));

  return { services, candidateRootCause, truncated };
}
