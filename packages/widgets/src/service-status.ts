import { z } from "zod";
import type { WidgetContract } from "./types";

export const SERVICE_STATUS_SOURCE_TYPES = [
  "app",
  "docker",
  "synology",
  "jellyfin",
  "immich",
  "beszel",
  "uptime-kuma",
  "prometheus",
  "proxmox",
  "grafana",
  "ntfy",
  "radarr",
  "sonarr",
] as const;

export type ServiceStatusSourceType = (typeof SERVICE_STATUS_SOURCE_TYPES)[number];

export const SERVICE_STATUS_DISPLAY_MODES = ["list", "compact"] as const;

export type ServiceStatusDisplayMode = (typeof SERVICE_STATUS_DISPLAY_MODES)[number];

export const SERVICE_STATUS_MAX_ITEMS = 24;
export const SERVICE_STATUS_DEFAULT_MAX_ITEMS = 12;

const sourceTypeSchema = z.enum(SERVICE_STATUS_SOURCE_TYPES);

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
  /^(app|docker|synology|jellyfin|immich|beszel|uptime-kuma|prometheus|proxmox|grafana|ntfy|radarr|sonarr):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?::[a-f0-9]{64})?$/iu;

export const serviceStatusConfigSchema = z.object({
  selectedSources: z
    .array(sourceTypeSchema)
    .max(SERVICE_STATUS_SOURCE_TYPES.length)
    .default([])
    .transform((values) => uniqueInOrder(values)),
  selectedIds: z
    .array(z.string().min(1).max(200))
    .max(24)
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
  displayMode: z.enum(SERVICE_STATUS_DISPLAY_MODES).default("list"),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(SERVICE_STATUS_MAX_ITEMS)
    .default(SERVICE_STATUS_DEFAULT_MAX_ITEMS),
});

export type ServiceStatusConfig = z.infer<typeof serviceStatusConfigSchema>;

export const serviceStatusDefaultConfig: ServiceStatusConfig = {
  selectedSources: [],
  selectedIds: [],
  displayMode: "list",
  maxItems: SERVICE_STATUS_DEFAULT_MAX_ITEMS,
};

export type ServiceStatusDraftConfig = {
  selectedSources: ServiceStatusSourceType[];
  selectedIds: string[];
  displayMode: ServiceStatusDisplayMode;
  maxItems: number;
};

export function sourceTypeFromServiceStatusId(id: string): ServiceStatusSourceType | null {
  const prefix = id.split(":")[0];
  return SERVICE_STATUS_SOURCE_TYPES.includes(prefix as ServiceStatusSourceType)
    ? (prefix as ServiceStatusSourceType)
    : null;
}

export function pruneServiceStatusSelectedIds(
  selectedIds: readonly string[],
  selectedSources: readonly ServiceStatusSourceType[],
): string[] {
  if (selectedSources.length === 0) return [...selectedIds];
  const allowed = new Set<ServiceStatusSourceType>(selectedSources);
  return selectedIds.filter((id) => {
    const source = sourceTypeFromServiceStatusId(id);
    return source !== null && allowed.has(source);
  });
}

export const serviceStatusDraftConfig: ServiceStatusDraftConfig = {
  selectedSources: [],
  selectedIds: [],
  displayMode: "list",
  maxItems: SERVICE_STATUS_DEFAULT_MAX_ITEMS,
};

export const serviceStatusContract: WidgetContract<ServiceStatusConfig> = {
  id: "service-status",
  version: 1,
  name: "Statut des services",
  description: "Vue synthétique de l'état des applications et intégrations déjà connues.",
  category: "monitoring",
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 8, h: 6 },
  defaultConfig: serviceStatusDefaultConfig,
  configSchema: serviceStatusConfigSchema,
  publicSafe: false,
};

export type ServiceStatusCanonical =
  "up" | "degraded" | "down" | "unknown" | "paused" | "maintenance";

export interface ServiceStatusItemView {
  id: string;
  name: string;
  sourceType: ServiceStatusSourceType;
  integrationId: string | null;
  status: ServiceStatusCanonical;
  detail: string | null;
  updatedAt: string | null;
}

export type ServiceStatusView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      displayMode: ServiceStatusDisplayMode;
      fetchedAt: string;
      truncated: boolean;
      partial: boolean;
      items: readonly ServiceStatusItemView[];
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
