import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { PrometheusQueryDto } from "@dashboard/prometheus";
import {
  PROMETHEUS_METRIC_UNSET_INTEGRATION_ID,
  prometheusMetricConfigSchema,
  type PrometheusMetricView,
} from "@dashboard/widgets";

export interface PrometheusBoardCaller {
  prometheus: {
    query: {
      instant: (input: { integrationId: string; query: string }) => Promise<PrometheusQueryDto>;
      range: (input: {
        integrationId: string;
        query: string;
        rangeSeconds: number;
        stepSeconds: number;
      }) => Promise<PrometheusQueryDto>;
    };
  };
}

function lastFiniteValue(dto: PrometheusQueryDto): number | null {
  for (const series of dto.series) {
    for (let index = series.points.length - 1; index >= 0; index -= 1) {
      const value = series.points[index]?.value;
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
  }
  return null;
}

function queryName(dto: PrometheusQueryDto): string {
  const first = dto.series[0]?.labels;
  if (first?.__name__) return first.__name__;
  if (first?.job) return first.job;
  if (first?.instance) return first.instance;
  return "metric";
}

function sparkline(dto: PrometheusQueryDto): readonly number[] {
  const points = dto.series[0]?.points ?? [];
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.slice(-30);
}

function toView(dto: PrometheusQueryDto): Extract<PrometheusMetricView, { status: "ready" }> {
  return {
    status: "ready",
    resultType: dto.resultType,
    queryName: queryName(dto),
    lastValue: lastFiniteValue(dto),
    seriesCount: dto.seriesCount,
    truncated: dto.truncated,
    overviewStatus: dto.status,
    fetchedAt: dto.fetchedAt,
    sparkline: sparkline(dto),
  };
}

export async function resolvePrometheusMetricViews(
  snapshot: BoardSnapshot,
  caller: PrometheusBoardCaller,
): Promise<Record<string, PrometheusMetricView>> {
  const views: Record<string, PrometheusMetricView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "prometheus-metric" || item.runtimeStatus !== "ready") continue;
    const parsed = prometheusMetricConfigSchema.safeParse(item.config);
    if (!parsed.success || parsed.data.integrationId === PROMETHEUS_METRIC_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      let dto;
      switch (parsed.data.mode) {
        case "instant":
          dto = await caller.prometheus.query.instant({
            integrationId: parsed.data.integrationId,
            query: parsed.data.query,
          });
          break;
        case "range":
          dto = await caller.prometheus.query.range({
            integrationId: parsed.data.integrationId,
            query: parsed.data.query,
            rangeSeconds: parsed.data.rangeSeconds,
            stepSeconds: parsed.data.stepSeconds,
          });
          break;
        default: {
          const _exhaustive: never = parsed.data.mode;
          throw new Error(String(_exhaustive));
        }
      }
      views[item.id] = toView(dto);
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
