import type { AppDefinition, AppLifecycleStatus } from "./types";

export function resolveLifecycleStatus(
  definition: Pick<AppDefinition, "lifecycle">,
): AppLifecycleStatus {
  return definition.lifecycle?.status ?? "active";
}

export function isActiveDefinition(definition: Pick<AppDefinition, "lifecycle">): boolean {
  return resolveLifecycleStatus(definition) === "active";
}

const LIFECYCLE_RANK: Record<AppLifecycleStatus, number> = {
  active: 0,
  legacy: 1,
  retired: 2,
};

export function compareAppDefinitions(left: AppDefinition, right: AppDefinition): number {
  const status =
    LIFECYCLE_RANK[resolveLifecycleStatus(left)] - LIFECYCLE_RANK[resolveLifecycleStatus(right)];
  if (status !== 0) return status;
  const category = left.category.localeCompare(right.category, "und");
  if (category !== 0) return category;
  const name = left.name.localeCompare(right.name, "und");
  if (name !== 0) return name;
  return left.id.localeCompare(right.id, "und");
}

export function validateReplacementGraph(definitions: ReadonlyMap<string, AppDefinition>): void {
  for (const definition of definitions.values()) {
    const replacedBy = definition.lifecycle?.replacedBy;
    if (!replacedBy) continue;
    if (replacedBy === definition.id)
      throw new Error(`App definition ${definition.id} cannot replace itself`);
    const seen = new Set<string>([definition.id]);
    let current: string | undefined = replacedBy;
    while (current) {
      if (seen.has(current))
        throw new Error(`Replacement cycle involving ${definition.id} and ${current}`);
      const target = definitions.get(current);
      if (!target) throw new Error(`replacedBy ${current} does not exist for ${definition.id}`);
      seen.add(current);
      current = target.lifecycle?.replacedBy;
    }
    const immediate = definitions.get(replacedBy);
    if (!immediate) throw new Error(`replacedBy ${replacedBy} does not exist for ${definition.id}`);
    if (resolveLifecycleStatus(immediate) !== "active")
      throw new Error(`replacedBy target ${replacedBy} must be active`);
  }
}
