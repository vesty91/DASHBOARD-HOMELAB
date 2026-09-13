import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import {
  PROMETHEUS_SAMPLES_MAX,
  PROMETHEUS_SERIES_DTO_MAX,
  PROMETHEUS_SERIES_RAW_REJECT,
} from "./schemas";
import type {
  PrometheusQueryDto,
  PrometheusResultType,
  PrometheusSamplePoint,
  PrometheusSeriesDto,
} from "./types";

export const PROMETHEUS_LABEL_ALLOWLIST = ["__name__", "job", "instance"] as const;
export const PROMETHEUS_LABEL_VALUE_MAX = 128;

type AllowedLabel = (typeof PROMETHEUS_LABEL_ALLOWLIST)[number];

const ALLOWED_LABELS = new Set<string>(PROMETHEUS_LABEL_ALLOWLIST);

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeLabelValue(value: unknown, secretValues: readonly string[]): string | undefined {
  if (typeof value !== "string") return undefined;
  if (/[\u0000-\u001F\u007F]/u.test(value)) return undefined;
  const redacted = redactKnownSecretValues(value, secretValues);
  if (typeof redacted !== "string") return undefined;
  const trimmed = redacted.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, PROMETHEUS_LABEL_VALUE_MAX);
}

export function sanitizePrometheusLabels(
  metric: unknown,
  secretValues: readonly string[],
): Readonly<Record<string, string>> {
  if (!isRecord(metric)) invalid("Prometheus metric labels are invalid");
  const labels: Record<string, string> = {};
  for (const key of PROMETHEUS_LABEL_ALLOWLIST) {
    if (!Object.hasOwn(metric, key)) continue;
    if (!ALLOWED_LABELS.has(key)) continue;
    const sanitized = sanitizeLabelValue(metric[key], secretValues);
    if (sanitized === undefined) continue;
    labels[key] = sanitized;
  }
  return labels;
}

function parsePrometheusNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") invalid("Prometheus sample value is invalid");
  if (raw === "NaN" || raw === "+Inf" || raw === "-Inf" || raw === "Inf") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const ms = Math.round(raw * 1000);
  if (!Number.isSafeInteger(ms)) return null;
  return ms;
}

function parseSampleTuple(raw: unknown): PrometheusSamplePoint | null {
  if (!Array.isArray(raw) || raw.length < 2) invalid("Prometheus sample is malformed");
  const tMs = parseTimestampMs(raw[0]);
  if (tMs === null) return null;
  return { tMs, value: parsePrometheusNumber(raw[1]) };
}

function parseVectorSeries(raw: unknown, secretValues: readonly string[]): PrometheusSeriesDto {
  if (!isRecord(raw)) invalid("Prometheus vector series is malformed");
  const labels = sanitizePrometheusLabels(raw.metric, secretValues);
  const point = parseSampleTuple(raw.value);
  return { labels, points: point ? [point] : [] };
}

function parseMatrixSeries(raw: unknown, secretValues: readonly string[]): PrometheusSeriesDto {
  if (!isRecord(raw)) invalid("Prometheus matrix series is malformed");
  const labels = sanitizePrometheusLabels(raw.metric, secretValues);
  if (!Array.isArray(raw.values)) invalid("Prometheus matrix values are malformed");
  const points: PrometheusSamplePoint[] = [];
  for (const entry of raw.values) {
    const point = parseSampleTuple(entry);
    if (point) points.push(point);
  }
  return { labels, points };
}

function parseJsonObject(body: Buffer | string): unknown {
  const text = typeof body === "string" ? body : body.toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    invalid("Prometheus response is not valid JSON");
  }
}

export function parsePrometheusApiBody(
  body: Buffer | string,
  expectedType: PrometheusResultType,
  secretValues: readonly string[] = [],
): {
  resultType: PrometheusResultType;
  series: PrometheusSeriesDto[];
  truncated: boolean;
  seriesCount: number;
  sampleCount: number;
} {
  const parsed = parseJsonObject(body);
  if (!isRecord(parsed)) invalid("Prometheus response is malformed");
  if (parsed.status === "error") invalid("Prometheus query returned an error");
  if (parsed.status !== "success") invalid("Prometheus response status is invalid");
  if (!isRecord(parsed.data)) invalid("Prometheus response data is malformed");
  const resultType = parsed.data.resultType;
  if (resultType !== "vector" && resultType !== "matrix")
    invalid("Prometheus resultType is not supported");
  if (resultType !== expectedType) invalid("Prometheus resultType does not match the request");
  if (!Array.isArray(parsed.data.result)) invalid("Prometheus result is malformed");
  if (parsed.data.result.length > PROMETHEUS_SERIES_RAW_REJECT)
    invalid("Prometheus result has too many series");
  const rawSeries = parsed.data.result.map((entry) => {
    switch (resultType) {
      case "vector":
        return parseVectorSeries(entry, secretValues);
      case "matrix":
        return parseMatrixSeries(entry, secretValues);
      default: {
        const _exhaustive: never = resultType;
        invalid(String(_exhaustive));
      }
    }
  });
  const rawSampleCount = rawSeries.reduce((total, series) => total + series.points.length, 0);
  if (rawSampleCount > PROMETHEUS_SAMPLES_MAX) invalid("Prometheus result has too many samples");
  const truncated = rawSeries.length > PROMETHEUS_SERIES_DTO_MAX;
  const series = truncated ? rawSeries.slice(0, PROMETHEUS_SERIES_DTO_MAX) : rawSeries;
  const sampleCount = series.reduce((total, item) => total + item.points.length, 0);
  return {
    resultType,
    series,
    truncated,
    seriesCount: series.length,
    sampleCount,
  };
}

export function assembleQueryDto(
  parsed: {
    resultType: PrometheusResultType;
    series: readonly PrometheusSeriesDto[];
    truncated: boolean;
    seriesCount: number;
    sampleCount: number;
  },
  fetchedAt = new Date().toISOString(),
): PrometheusQueryDto {
  return {
    resultType: parsed.resultType,
    series: parsed.series,
    truncated: parsed.truncated,
    seriesCount: parsed.seriesCount,
    sampleCount: parsed.sampleCount,
    fetchedAt,
    status: parsed.truncated ? "degraded" : "available",
  };
}

export function isAllowedPrometheusLabel(key: string): key is AllowedLabel {
  return ALLOWED_LABELS.has(key);
}
