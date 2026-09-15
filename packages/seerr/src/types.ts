import type { IntegrationActor } from "@dashboard/integrations";

export type SeerrActor = IntegrationActor;

export type SeerrHttpMethod = "GET" | "POST";

export type SeerrSectionStatus = "available" | "degraded" | "unavailable";

export type SeerrSectionReason =
  | "api-unavailable"
  | "permission-denied"
  | "timeout"
  | "invalid-response"
  | "unauthorized"
  | "rate-limited"
  | "dns"
  | "tls"
  | "unreachable"
  | "unknown";

export type SeerrOverviewStatus = "available" | "degraded";

export interface SeerrPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
  readonly canManageRequests: boolean;
}

export interface SeerrIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface SeerrStatusDto {
  readonly version: string | null;
  readonly compatibleProduct?: "seerr-family";
}

export interface SeerrCountsDto {
  pending: number;
  approved: number;
  processing: number;
  available: number;
  total?: number;
}

export interface SeerrSection<T> {
  readonly status: SeerrSectionStatus;
  readonly data: T | null;
  readonly reason?: SeerrSectionReason;
}

export interface SeerrOverview {
  readonly status: SeerrOverviewStatus;
  readonly fetchedAt: string;
  readonly system: SeerrSection<SeerrStatusDto>;
  readonly counts: SeerrSection<SeerrCountsDto>;
}
