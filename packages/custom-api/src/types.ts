import type { IntegrationActor } from "@dashboard/integrations";

export type CustomApiActor = IntegrationActor;

export type CustomApiHttpMethod = "GET";

export type CustomApiSectionStatus = "available" | "degraded" | "unavailable";

export type CustomApiSectionReason =
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

export type CustomApiOverviewStatus = "available" | "degraded";

export type CustomApiDisplayMode = "text" | "number" | "badge" | "list";

export type CustomApiBadgeTone = "neutral" | "success" | "warning" | "danger";

export interface CustomApiPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface CustomApiEndpointMeta {
  readonly key: string;
  readonly label: string;
  readonly path: string;
}

export interface CustomApiIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly endpoints: readonly CustomApiEndpointMeta[];
}

export type CustomApiValueDto =
  | { readonly display: "text"; readonly text: string }
  | { readonly display: "number"; readonly number: number }
  | { readonly display: "badge"; readonly label: string; readonly tone: CustomApiBadgeTone }
  | { readonly display: "list"; readonly items: readonly string[]; readonly truncated: boolean };

export interface CustomApiSection<T> {
  readonly status: CustomApiSectionStatus;
  readonly data: T | null;
  readonly reason?: CustomApiSectionReason;
}

export interface CustomApiProbeDto {
  readonly endpointKey: string;
  readonly json: true;
}

export interface CustomApiOverview {
  readonly status: CustomApiOverviewStatus;
  readonly fetchedAt: string;
  readonly probe: CustomApiSection<CustomApiProbeDto>;
  readonly endpoints: readonly Omit<CustomApiEndpointMeta, "path">[];
}

export interface CustomApiValueResult {
  readonly status: CustomApiOverviewStatus;
  readonly fetchedAt: string;
  readonly endpointKey: string;
  readonly value: CustomApiSection<CustomApiValueDto>;
}
