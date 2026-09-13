import type { IntegrationActor } from "@dashboard/integrations";

export type PrometheusActor = IntegrationActor;

export type PrometheusHttpMethod = "POST";

export type PrometheusResultType = "vector" | "matrix";

export type PrometheusQueryMode = "instant" | "range";

export type PrometheusOverviewStatus = "available" | "degraded";

export interface PrometheusPermissionsView {
  readonly canRead: boolean;
  readonly canManage: boolean;
}

export interface PrometheusIntegrationMetadata {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface PrometheusSamplePoint {
  readonly tMs: number;
  readonly value: number | null;
}

export interface PrometheusSeriesDto {
  readonly labels: Readonly<Record<string, string>>;
  readonly points: readonly PrometheusSamplePoint[];
}

export interface PrometheusQueryDto {
  readonly resultType: PrometheusResultType;
  readonly series: readonly PrometheusSeriesDto[];
  readonly truncated: boolean;
  readonly seriesCount: number;
  readonly sampleCount: number;
  readonly fetchedAt: string;
  readonly status: PrometheusOverviewStatus;
}

export type PrometheusOverview = PrometheusQueryDto;

export interface PrometheusValidatedInstantQuery {
  readonly mode: "instant";
  readonly query: string;
}

export interface PrometheusValidatedRangeQuery {
  readonly mode: "range";
  readonly query: string;
  readonly rangeSeconds: number;
  readonly stepSeconds: number;
}

export type PrometheusValidatedQuery =
  PrometheusValidatedInstantQuery | PrometheusValidatedRangeQuery;
