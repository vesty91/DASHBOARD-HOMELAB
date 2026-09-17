import type { ServiceDependency } from "./types";

/** Max nodes visited during cycle / impact traversal (DoS bound). */
export const TOPOLOGY_MAX_NODES = 500;
/** Max BFS/DFS depth (DoS bound). */
export const TOPOLOGY_MAX_DEPTH = 32;

export type DependencyEdge = Pick<ServiceDependency, "upstreamServiceKey" | "downstreamServiceKey">;

/**
 * Build adjacency: upstream → list of downstream dependents
 * (blast-radius direction).
 */
export function buildDownstreamAdjacency(edges: readonly DependencyEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.upstreamServiceKey) ?? [];
    list.push(edge.downstreamServiceKey);
    map.set(edge.upstreamServiceKey, list);
  }
  return map;
}

/**
 * Returns true if adding edge (upstream → downstream) would create a cycle.
 * A cycle exists if downstream can already reach upstream via existing edges.
 */
export function wouldCreateCycle(
  edges: readonly DependencyEdge[],
  upstreamServiceKey: string,
  downstreamServiceKey: string,
): boolean {
  if (upstreamServiceKey === downstreamServiceKey) return true;
  const adjacency = buildDownstreamAdjacency(edges);
  const stack = [downstreamServiceKey];
  const visited = new Set<string>();
  let visitedCount = 0;
  let depth = 0;
  while (stack.length > 0) {
    if (depth > TOPOLOGY_MAX_DEPTH || visitedCount > TOPOLOGY_MAX_NODES) {
      return true;
    }
    const current = stack.pop()!;
    if (current === upstreamServiceKey) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    visitedCount += 1;
    const next = adjacency.get(current) ?? [];
    for (const child of next) stack.push(child);
    depth += 1;
  }
  return false;
}
