import type { WidgetContract, WidgetItemStatus, WidgetResolveResult } from "./types";

function migrate(
  definition: WidgetContract,
  version: number,
  config: unknown,
): { status: "ok"; config: unknown } | { status: "missing-step" } | { status: "failed" } {
  let current = config;
  for (let from = version; from < definition.version; from += 1) {
    const step = definition.migrations?.[from];
    if (!step) return { status: "missing-step" };
    try {
      current = step(current);
    } catch {
      return { status: "failed" };
    }
  }
  return { status: "ok", config: current };
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
  const migrated =
    version === definition.version
      ? { status: "ok" as const, config }
      : migrate(definition, version, config);
  if (migrated.status === "missing-step") return { status: "incompatible-version" };
  if (migrated.status === "failed") return { status: "invalid-config" };
  const parsed = definition.configSchema.safeParse(migrated.config);
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
