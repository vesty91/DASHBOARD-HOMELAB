import type { WidgetContract, WidgetItemStatus, WidgetResolveResult } from "./types";

function migrate(definition: WidgetContract, version: number, config: unknown): unknown | null {
  let current = config;
  for (let from = version; from < definition.version; from += 1) {
    const step = definition.migrations?.[from];
    if (!step) return null;
    current = step(current);
  }
  return current;
}

export function resolveWidgetConfig(
  definition: WidgetContract | undefined,
  version: number,
  config: unknown,
  parseFailed = false,
): WidgetResolveResult {
  if (!definition) return { status: "unknown" };
  if (parseFailed) return { status: "configuration-missing" };
  if (!Number.isInteger(version) || version < 1) return { status: "invalid-config" };
  if (version > definition.version) return { status: "incompatible-version" };
  const migrated = version === definition.version ? config : migrate(definition, version, config);
  if (migrated === null) return { status: "incompatible-version" };
  const parsed = definition.configSchema.safeParse(migrated);
  if (!parsed.success) return { status: "invalid-config" };
  return {
    status: "ready",
    config: parsed.data,
    version: definition.version,
    publicSafe: definition.publicSafe,
  };
}

export function statusToRuntime(
  status: WidgetItemStatus,
): Exclude<
  import("./types").WidgetRuntimeState,
  "loading" | "stale" | "disconnected" | "empty" | "permission-denied"
> {
  switch (status) {
    case "ready":
      return "ready";
    case "unknown":
    case "incompatible-version":
      return "error";
    case "invalid-config":
    case "configuration-missing":
      return "configuration-missing";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function serializeWidgetConfig(config: unknown): string {
  return JSON.stringify(config);
}
