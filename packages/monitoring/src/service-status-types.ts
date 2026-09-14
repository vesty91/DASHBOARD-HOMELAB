export const SERVICE_STATUS_VALUES = [
  "up",
  "degraded",
  "down",
  "unknown",
  "paused",
  "maintenance",
] as const;

export type ServiceStatusCanonical = (typeof SERVICE_STATUS_VALUES)[number];

export const SERVICE_SOURCE_TYPES = [
  "app",
  "docker",
  "synology",
  "jellyfin",
  "immich",
  "beszel",
  "uptime-kuma",
  "prometheus",
  "proxmox",
] as const;

export type ServiceSourceType = (typeof SERVICE_SOURCE_TYPES)[number];

export const SERVICE_STATUS_MAX_ITEMS = 24;
export const SERVICE_STATUS_DEFAULT_MAX_ITEMS = 12;
export const SERVICE_STATUS_MAX_SELECTED_IDS = 24;
export const SERVICE_STATUS_MAX_SELECTED_SOURCES = SERVICE_SOURCE_TYPES.length;

export interface ServiceStatusItem {
  readonly id: string;
  readonly name: string;
  readonly sourceType: ServiceSourceType;
  readonly integrationId: string | null;
  readonly status: ServiceStatusCanonical;
  readonly detail: string | null;
  readonly updatedAt: string | null;
}

export interface ServiceStatusCatalogItem {
  readonly id: string;
  readonly name: string;
  readonly sourceType: ServiceSourceType;
}

export type ServiceStatusListStatus = "available" | "degraded";

export interface ServiceStatusListResult {
  readonly status: ServiceStatusListStatus;
  readonly items: readonly ServiceStatusItem[];
  readonly truncated: boolean;
  readonly partial: boolean;
  readonly fetchedAt: string;
}

export interface ServiceStatusCatalogResult {
  readonly items: readonly ServiceStatusCatalogItem[];
}

export interface ServiceStatusQuery {
  readonly selectedSources: readonly ServiceSourceType[];
  readonly selectedIds: readonly string[];
  readonly maxItems: number;
}

export interface ServiceStatusActor {
  readonly userId: string | null;
  readonly subject?: unknown;
}

export interface ServiceStatusCollector {
  readonly sourceType: ServiceSourceType;
  canRead(actor: ServiceStatusActor): boolean;
  listIdentities(
    actor: ServiceStatusActor,
    query: ServiceStatusQuery,
  ): Promise<readonly ServiceStatusCatalogItem[]>;
  collect(
    actor: ServiceStatusActor,
    query: ServiceStatusQuery,
  ): Promise<readonly ServiceStatusItem[]>;
}

export interface ServiceStatusCoalescer {
  run<T>(key: string, factory: () => Promise<T>): Promise<T>;
}
