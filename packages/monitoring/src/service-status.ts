import { z } from "zod";
import {
  SERVICE_SOURCE_TYPES,
  SERVICE_STATUS_DEFAULT_MAX_ITEMS,
  SERVICE_STATUS_MAX_ITEMS,
  SERVICE_STATUS_MAX_SELECTED_IDS,
  SERVICE_STATUS_MAX_SELECTED_SOURCES,
  type ServiceSourceType,
  type ServiceStatusActor,
  type ServiceStatusCatalogItem,
  type ServiceStatusCatalogResult,
  type ServiceStatusCoalescer,
  type ServiceStatusCollector,
  type ServiceStatusItem,
  type ServiceStatusListResult,
  type ServiceStatusQuery,
} from "./service-status-types";

const sourceTypeSchema = z.enum(SERVICE_SOURCE_TYPES);

function uniqueInOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export const SERVICE_STATUS_ID_PATTERN =
  /^(app|docker|synology|jellyfin|immich|beszel|uptime-kuma|prometheus|proxmox|grafana|ntfy|prowlarr|qbittorrent|radarr|sonarr):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?::[a-f0-9]{64})?$/iu;

export const serviceStatusQuerySchema = z.object({
  selectedSources: z
    .array(sourceTypeSchema)
    .max(SERVICE_STATUS_MAX_SELECTED_SOURCES)
    .default([])
    .transform((values) => uniqueInOrder(values)),
  selectedIds: z
    .array(z.string().min(1).max(200))
    .max(SERVICE_STATUS_MAX_SELECTED_IDS)
    .default([])
    .transform((values) => uniqueInOrder(values))
    .superRefine((values, ctx) => {
      for (const value of values) {
        if (!SERVICE_STATUS_ID_PATTERN.test(value)) {
          ctx.addIssue({ code: "custom", message: "Invalid service status id" });
          return;
        }
      }
    }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(SERVICE_STATUS_MAX_ITEMS)
    .default(SERVICE_STATUS_DEFAULT_MAX_ITEMS),
});

const SOURCE_ORDER = new Map<ServiceSourceType, number>(
  SERVICE_SOURCE_TYPES.map((source, index) => [source, index]),
);

export function compareServiceStatusItems(
  left: ServiceStatusItem,
  right: ServiceStatusItem,
): number {
  const sourceDelta =
    (SOURCE_ORDER.get(left.sourceType) ?? 99) - (SOURCE_ORDER.get(right.sourceType) ?? 99);
  if (sourceDelta !== 0) return sourceDelta;
  const nameDelta = left.name.localeCompare(right.name, "und");
  if (nameDelta !== 0) return nameDelta;
  return left.id.localeCompare(right.id, "und");
}

export function matchesSelectedIds(itemId: string, selectedIds: readonly string[]): boolean {
  if (selectedIds.length === 0) return true;
  return selectedIds.some((selected) => itemId === selected || itemId.startsWith(`${selected}:`));
}

function freezeItem(item: ServiceStatusItem): ServiceStatusItem {
  return Object.freeze({ ...item });
}

function freezeCatalogItem(item: ServiceStatusCatalogItem): ServiceStatusCatalogItem {
  return Object.freeze({ ...item });
}

function subjectFingerprint(subject: unknown): string {
  if (!subject || typeof subject !== "object") return "";
  const record = subject as Record<string, unknown>;
  const direct = Array.isArray(record.directPermissions)
    ? [...record.directPermissions].map(String).sort()
    : [];
  const group = Array.isArray(record.groupPermissions)
    ? [...record.groupPermissions].map(String).sort()
    : [];
  return JSON.stringify({
    status: typeof record.status === "string" ? record.status : "",
    isSystemAdmin: record.isSystemAdmin === true,
    directPermissions: direct,
    groupPermissions: group,
  });
}

function queryKey(
  collectors: readonly ServiceStatusCollector[],
  actor: ServiceStatusActor,
  query: ServiceStatusQuery,
  kind: "list" | "catalog",
): string {
  return JSON.stringify({
    kind,
    userId: actor.userId,
    authorization: subjectFingerprint(actor.subject),
    readableSources: collectors
      .filter((collector) => collector.canRead(actor))
      .map((collector) => collector.sourceType),
    selectedSources: query.selectedSources,
    selectedIds: query.selectedIds,
    maxItems: query.maxItems,
  });
}

export interface ServiceStatusServiceDeps {
  readonly collectors: readonly ServiceStatusCollector[];
  readonly coalescer?: ServiceStatusCoalescer;
  readonly now?: () => Date;
}

function parseQuery(input: unknown): ServiceStatusQuery {
  return serviceStatusQuerySchema.parse(input ?? {});
}

function activeCollectors(
  collectors: readonly ServiceStatusCollector[],
  actor: ServiceStatusActor,
  selectedSources: readonly ServiceSourceType[],
): ServiceStatusCollector[] {
  const wanted = selectedSources.length === 0 ? SERVICE_SOURCE_TYPES : selectedSources;
  const wantedSet = new Set<ServiceSourceType>(wanted);
  return collectors.filter(
    (collector) => wantedSet.has(collector.sourceType) && collector.canRead(actor),
  );
}

export function createServiceStatusService(deps: ServiceStatusServiceDeps) {
  async function collectList(
    actor: ServiceStatusActor,
    query: ServiceStatusQuery,
  ): Promise<ServiceStatusListResult> {
    const collectors = activeCollectors(deps.collectors, actor, query.selectedSources);
    const settled = await Promise.all(
      collectors.map(async (collector) => {
        try {
          return { ok: true as const, items: await collector.collect(actor, query) };
        } catch (error: unknown) {
          void error;
          return { ok: false as const, items: [] as const };
        }
      }),
    );
    const merged = settled
      .flatMap((entry) => entry.items)
      .filter((item) => matchesSelectedIds(item.id, query.selectedIds))
      .map(freezeItem)
      .sort(compareServiceStatusItems);
    const truncated = merged.length > query.maxItems;
    const items = Object.freeze(merged.slice(0, query.maxItems));
    const partial = settled.some((entry) => !entry.ok);
    return Object.freeze({
      status: partial ? ("degraded" as const) : ("available" as const),
      items,
      truncated,
      partial,
      fetchedAt: (deps.now ?? (() => new Date()))().toISOString(),
    });
  }

  async function collectCatalog(
    actor: ServiceStatusActor,
    query: ServiceStatusQuery,
  ): Promise<ServiceStatusCatalogResult> {
    const collectors = activeCollectors(deps.collectors, actor, query.selectedSources);
    const settled = await Promise.all(
      collectors.map(async (collector) => {
        try {
          return await collector.listIdentities(actor, query);
        } catch (error: unknown) {
          void error;
          return [];
        }
      }),
    );
    const items = Object.freeze(
      settled
        .flat()
        .filter((item) => matchesSelectedIds(item.id, query.selectedIds))
        .map(freezeCatalogItem)
        .sort((left, right) => {
          const sourceDelta =
            (SOURCE_ORDER.get(left.sourceType) ?? 99) - (SOURCE_ORDER.get(right.sourceType) ?? 99);
          if (sourceDelta !== 0) return sourceDelta;
          const nameDelta = left.name.localeCompare(right.name, "und");
          if (nameDelta !== 0) return nameDelta;
          return left.id.localeCompare(right.id, "und");
        }),
    );
    return Object.freeze({ items });
  }

  return {
    async list(input: unknown, actor: ServiceStatusActor): Promise<ServiceStatusListResult> {
      const query = parseQuery(input);
      const run = () => collectList(actor, query);
      return deps.coalescer
        ? deps.coalescer.run(queryKey(deps.collectors, actor, query, "list"), run)
        : run();
    },
    async catalog(input: unknown, actor: ServiceStatusActor): Promise<ServiceStatusCatalogResult> {
      const query = parseQuery(input);
      const run = () => collectCatalog(actor, query);
      return deps.coalescer
        ? deps.coalescer.run(queryKey(deps.collectors, actor, query, "catalog"), run)
        : run();
    },
  };
}

export type ServiceStatusService = ReturnType<typeof createServiceStatusService>;
