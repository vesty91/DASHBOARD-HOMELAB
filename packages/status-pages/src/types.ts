export const PUBLIC_SERVICE_STATUSES = [
  "operational",
  "degraded",
  "outage",
  "maintenance",
  "unknown",
] as const;
export type PublicServiceStatus = (typeof PUBLIC_SERVICE_STATUSES)[number];

export const STATUS_PAGE_VISIBILITIES = ["private", "public"] as const;
export type StatusPageVisibility = (typeof STATUS_PAGE_VISIBILITIES)[number];

export const MAINTENANCE_WINDOW_STATUSES = [
  "scheduled",
  "active",
  "completed",
  "cancelled",
] as const;
export type MaintenanceWindowStatus = (typeof MAINTENANCE_WINDOW_STATUSES)[number];

export type IntegrationHealthStatus = "unknown" | "available" | "unavailable";

export interface StatusPageRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: StatusPageVisibility;
  enabled: boolean;
  createdBy: string | null;
  configRevision: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatusPageServiceRecord {
  id: string;
  statusPageId: string;
  sourceIntegrationId: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  showIncidentHistory: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceWindowRecord {
  id: string;
  name: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  status: MaintenanceWindowStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceWindowTargetRecord {
  maintenanceId: string;
  integrationId: string;
}

export interface MaintenanceWindowSnapshot {
  window: MaintenanceWindowRecord;
  integrationIds: readonly string[];
}

export interface MaintenanceWindowDto {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: MaintenanceWindowStatus;
  integrationIds: readonly string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicMaintenanceWindowDto {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: Extract<MaintenanceWindowStatus, "scheduled" | "active">;
}

export interface StatusPageSnapshot {
  page: StatusPageRecord;
  services: readonly StatusPageServiceRecord[];
}

export interface PublicStatusServiceDto {
  id: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  status: PublicServiceStatus;
  showIncidentHistory: boolean;
}

export interface PublicStatusPageDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  overallStatus: PublicServiceStatus;
  services: readonly PublicStatusServiceDto[];
  maintenances: readonly PublicMaintenanceWindowDto[];
  updatedAt: string;
}

export interface ManagedStatusServiceDto {
  id: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  showIncidentHistory: boolean;
  sourceIntegrationId: string;
  status: PublicServiceStatus;
}

export interface ManagedStatusPageDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: StatusPageVisibility;
  enabled: boolean;
  configRevision: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  overallStatus: PublicServiceStatus;
  services: readonly ManagedStatusServiceDto[];
}

export interface StatusPageActor {
  userId: string | null;
  subject: {
    status: "active" | "disabled";
    isSystemAdmin: boolean;
    directPermissions?: readonly string[];
    groupPermissions?: readonly string[];
  } | null;
}

export interface IntegrationStatusLookup {
  id: string;
  status: IntegrationHealthStatus;
  baseUrl?: string;
}

export interface StatusPageStorePort {
  listPages(): Promise<StatusPageRecord[]>;
  findPageById(id: string): Promise<StatusPageRecord | null>;
  findPageBySlug(slug: string): Promise<StatusPageRecord | null>;
  findSnapshotById(id: string): Promise<StatusPageSnapshot | null>;
  findSnapshotBySlug(slug: string): Promise<StatusPageSnapshot | null>;
  createPage(input: {
    name: string;
    slug: string;
    description: string | null;
    visibility: StatusPageVisibility;
    enabled: boolean;
    createdBy: string | null;
    now: Date;
  }): Promise<StatusPageRecord>;
  updatePage(input: {
    id: string;
    expectedConfigRevision: number;
    name: string;
    slug: string;
    description: string | null;
    visibility: StatusPageVisibility;
    enabled: boolean;
    now: Date;
  }): Promise<StatusPageRecord>;
  deletePage(id: string, expectedConfigRevision: number): Promise<void>;
  replaceServices(input: {
    statusPageId: string;
    expectedConfigRevision: number;
    services: readonly {
      sourceIntegrationId: string;
      displayName: string;
      description: string | null;
      sortOrder: number;
      showIncidentHistory: boolean;
    }[];
    now: Date;
  }): Promise<StatusPageSnapshot>;
  listOpenAvailabilityIncidentIntegrationIds(
    integrationIds: readonly string[],
  ): Promise<ReadonlySet<string>>;
  listActiveMaintenanceIntegrationIds(
    integrationIds: readonly string[],
    now: Date,
  ): Promise<ReadonlySet<string>>;
  findIntegrationStatuses(
    integrationIds: readonly string[],
  ): Promise<ReadonlyMap<string, IntegrationStatusLookup>>;
  listMaintenanceWindows(): Promise<MaintenanceWindowSnapshot[]>;
  findMaintenanceById(id: string): Promise<MaintenanceWindowSnapshot | null>;
  listNonTerminalMaintenanceWindows(): Promise<MaintenanceWindowSnapshot[]>;
  listPublicMaintenancesForIntegrations(
    integrationIds: readonly string[],
    now: Date,
  ): Promise<MaintenanceWindowSnapshot[]>;
  listStatusPageIdsForIntegrations(integrationIds: readonly string[]): Promise<readonly string[]>;
  findExistingIntegrationIds(ids: readonly string[]): Promise<ReadonlySet<string>>;
  createMaintenanceWindow(input: {
    name: string;
    description: string | null;
    startsAt: Date;
    endsAt: Date;
    status: MaintenanceWindowStatus;
    integrationIds: readonly string[];
    createdBy: string | null;
    now: Date;
  }): Promise<MaintenanceWindowSnapshot>;
  updateMaintenanceStatus(input: {
    id: string;
    fromStatuses: readonly MaintenanceWindowStatus[];
    toStatus: MaintenanceWindowStatus;
    now: Date;
  }): Promise<MaintenanceWindowSnapshot | null>;
}

export const PUBLIC_STATUS_CACHE_TTL_MS = 15_000;
export const PUBLIC_STATUS_RATE_LIMIT = 60;
export const PUBLIC_STATUS_RATE_WINDOW_MS = 60_000;
