import { type IntegrationClientContext } from "@dashboard/integrations";
import { assembleQueryDto, parsePrometheusApiBody } from "./dto";
import { PROMETHEUS_QUERY_PATH, PROMETHEUS_QUERY_RANGE_PATH } from "./policy";
import {
  PROMETHEUS_OVERVIEW_QUERY,
  prometheusTimeoutSeconds,
  type PrometheusConfig,
  type PrometheusSecrets,
} from "./schemas";
import {
  PROMETHEUS_JSON_MAX_BYTES,
  prometheusFetch,
  type PrometheusRequestFn,
  type PrometheusTransportContext,
} from "./transport";
import type { PrometheusQueryDto, PrometheusValidatedQuery } from "./types";

export const OVERVIEW_CACHE_TTL_MS = 15_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 8_000;
export const PROMETHEUS_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface PrometheusClientContext extends PrometheusTransportContext {
  readonly request: PrometheusRequestFn;
  readonly secretValues: readonly string[];
  readonly now?: () => number;
}

export function prometheusContextFromIntegration(
  ctx: IntegrationClientContext<PrometheusConfig, PrometheusSecrets> & {
    secretValues?: readonly string[];
    now?: () => number;
  },
): PrometheusClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  const bearerToken =
    typeof ctx.secrets.bearerToken === "string" && ctx.secrets.bearerToken.length > 0
      ? ctx.secrets.bearerToken
      : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    request: ctx.request,
    secretValues: ctx.secretValues ?? (bearerToken === undefined ? [] : [bearerToken]),
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    ...(bearerToken === undefined ? {} : { bearerToken }),
    ...(ctx.now === undefined ? {} : { now: ctx.now }),
  };
}

export function overviewCacheTtl(overview: PrometheusQueryDto): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

export async function executePrometheusQuery(
  ctx: PrometheusClientContext,
  input: PrometheusValidatedQuery,
): Promise<PrometheusQueryDto> {
  const timeout = `${prometheusTimeoutSeconds(ctx.timeoutMs)}s`;
  switch (input.mode) {
    case "instant": {
      const result = await prometheusFetch(
        ctx.request,
        ctx,
        "POST",
        PROMETHEUS_QUERY_PATH,
        {
          query: input.query,
          timeout,
        },
        { maxBodyBytes: PROMETHEUS_JSON_MAX_BYTES },
      );
      return assembleQueryDto(parsePrometheusApiBody(result.body, "vector", ctx.secretValues));
    }
    case "range": {
      const nowMs = ctx.now?.() ?? Date.now();
      const endSeconds = Math.floor(nowMs / 1000);
      const startSeconds = endSeconds - input.rangeSeconds;
      const result = await prometheusFetch(
        ctx.request,
        ctx,
        "POST",
        PROMETHEUS_QUERY_RANGE_PATH,
        {
          query: input.query,
          start: String(startSeconds),
          end: String(endSeconds),
          step: String(input.stepSeconds),
          timeout,
        },
        { maxBodyBytes: PROMETHEUS_JSON_MAX_BYTES },
      );
      return assembleQueryDto(parsePrometheusApiBody(result.body, "matrix", ctx.secretValues));
    }
    default: {
      const _exhaustive: never = input;
      throw _exhaustive;
    }
  }
}

export async function fetchPrometheusOverview(
  ctx: PrometheusClientContext,
): Promise<PrometheusQueryDto> {
  return executePrometheusQuery(ctx, { mode: "instant", query: PROMETHEUS_OVERVIEW_QUERY });
}

export async function testPrometheusConnection(
  ctx: PrometheusClientContext,
): Promise<{ seriesCount: number }> {
  const overview = await fetchPrometheusOverview(ctx);
  return { seriesCount: overview.seriesCount };
}
