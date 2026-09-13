import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type { UptimeKumaMonitorDto, UptimeKumaMonitorStatus, UptimeKumaMonitorsDto } from "./types";

export const UPTIME_KUMA_MONITORS_MAX = 200;

type MonitoredMetric = "monitor_status" | "monitor_response_time" | "monitor_uptime_ratio";

const MONITORED_METRICS = new Set<MonitoredMetric>([
  "monitor_status",
  "monitor_response_time",
  "monitor_uptime_ratio",
]);

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

function safeText(value: string | undefined, secretValues: readonly string[]): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  const redacted = redactKnownSecretValues(trimmed, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

function sanitizeIdentity(
  value: string | undefined,
  secretValues: readonly string[],
): string | null {
  const text = safeText(value, secretValues);
  if (!text) return null;
  return text.slice(0, 64);
}

function decodeLabelValue(raw: string): string {
  let decoded = "";
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char !== "\\") {
      decoded += char;
      continue;
    }
    const next = raw[index + 1];
    if (next === "n") {
      decoded += "\n";
      index += 1;
      continue;
    }
    if (next === "\\" || next === '"') {
      decoded += next;
      index += 1;
      continue;
    }
    decoded += char;
  }
  return decoded;
}

function parseLabels(
  source: string,
  start: number,
): { labels: Record<string, string>; end: number } {
  const labels: Record<string, string> = {};
  let index = start + 1;
  while (index < source.length) {
    while (index < source.length && (source[index] === " " || source[index] === "\t")) index += 1;
    if (source[index] === "}") return { labels, end: index + 1 };
    if (source[index] === ",") {
      index += 1;
      continue;
    }
    const nameStart = index;
    while (index < source.length && /[A-Za-z0-9_]/u.test(source[index] ?? "")) index += 1;
    const name = source.slice(nameStart, index);
    if (!name) invalid("Uptime Kuma Prometheus label is invalid");
    while (index < source.length && (source[index] === " " || source[index] === "\t")) index += 1;
    if (source[index] !== "=") invalid("Uptime Kuma Prometheus label is invalid");
    index += 1;
    while (index < source.length && (source[index] === " " || source[index] === "\t")) index += 1;
    if (source[index] !== '"') invalid("Uptime Kuma Prometheus label is invalid");
    index += 1;
    let raw = "";
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        raw += char + (source[index + 1] ?? "");
        index += 2;
        continue;
      }
      if (char === '"') break;
      raw += char;
      index += 1;
    }
    if (source[index] !== '"') invalid("Uptime Kuma Prometheus label is invalid");
    index += 1;
    labels[name] = decodeLabelValue(raw);
  }
  invalid("Uptime Kuma Prometheus labels are unterminated");
}

function parsePromNumber(token: string): number {
  if (token === "NaN" || token === "+Inf" || token === "-Inf" || token === "Inf")
    invalid("Uptime Kuma Prometheus value is not finite");
  const value = Number(token);
  if (!Number.isFinite(value)) invalid("Uptime Kuma Prometheus value is not finite");
  return value;
}

function mapStatus(value: number): UptimeKumaMonitorStatus {
  if (value === 1) return "up";
  if (value === 0) return "down";
  if (value === 2) return "pending";
  if (value === 3) return "maintenance";
  invalid("Uptime Kuma monitor status is unknown");
}

function mapLatency(value: number): number | null {
  if (value === -1) return null;
  if (!Number.isFinite(value) || value < 0) invalid("Uptime Kuma monitor latency is invalid");
  if (value > Number.MAX_SAFE_INTEGER) return null;
  return value;
}

function mapUptimePercent(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    invalid("Uptime Kuma monitor uptime ratio is invalid");
  return value * 100;
}

interface ParsedSeries {
  metric: MonitoredMetric;
  labels: Record<string, string>;
  value: number;
}

function parseSeriesLine(line: string): ParsedSeries | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const nameMatch =
    /^(monitor_status|monitor_response_time|monitor_uptime_ratio)(?=[{ \t]|$)/u.exec(trimmed);
  if (!nameMatch) return null;
  const metric = nameMatch[1] as MonitoredMetric | undefined;
  if (!metric || !MONITORED_METRICS.has(metric)) return null;
  let cursor = metric.length;
  let labels: Record<string, string> = {};
  if (trimmed[cursor] === "{") {
    const parsed = parseLabels(trimmed, cursor);
    labels = parsed.labels;
    cursor = parsed.end;
  }
  const rest = trimmed.slice(cursor).trim();
  if (!rest) invalid("Uptime Kuma Prometheus sample is missing a value");
  const tokens = rest.split(/[ \t]+/u);
  const valueToken = tokens[0];
  if (!valueToken) invalid("Uptime Kuma Prometheus sample is missing a value");
  return { metric, labels, value: parsePromNumber(valueToken) };
}

interface AccumulatedMonitor {
  id: string;
  name: string;
  status?: UptimeKumaMonitorStatus;
  latencyMs: number | null;
  uptimePercent: number | null;
}

function joinKey(labels: Record<string, string>, secretValues: readonly string[]): string {
  const monitorId = sanitizeIdentity(labels.monitor_id, secretValues);
  if (monitorId) return `id:${monitorId}`;
  const monitorName = sanitizeIdentity(labels.monitor_name, secretValues);
  if (monitorName) return `name:${monitorName}`;
  invalid("Uptime Kuma monitor is missing monitor_id and monitor_name");
}

function displayId(labels: Record<string, string>, secretValues: readonly string[]): string {
  return (
    sanitizeIdentity(labels.monitor_id, secretValues) ??
    sanitizeIdentity(labels.monitor_name, secretValues) ??
    invalid("Uptime Kuma monitor is missing monitor_id and monitor_name")
  );
}

function displayName(
  labels: Record<string, string>,
  id: string,
  secretValues: readonly string[],
): string {
  return safeText(labels.monitor_name, secretValues)?.slice(0, 200) ?? id;
}

export function parsePrometheusMonitors(
  body: Buffer | string,
  secretValues: readonly string[] = [],
): { monitors: UptimeKumaMonitorDto[]; truncated: boolean } {
  const text = typeof body === "string" ? body : body.toString("utf8");
  const joined = new Map<string, AccumulatedMonitor>();
  for (const line of text.split(/\r?\n/u)) {
    const series = parseSeriesLine(line);
    if (!series) continue;
    if (series.metric === "monitor_uptime_ratio" && series.labels.window !== "1d") continue;
    const key = joinKey(series.labels, secretValues);
    const existing = joined.get(key);
    const id = existing?.id ?? displayId(series.labels, secretValues);
    const name = existing?.name ?? displayName(series.labels, id, secretValues);
    const next: AccumulatedMonitor = existing ?? {
      id,
      name,
      latencyMs: null,
      uptimePercent: null,
    };
    switch (series.metric) {
      case "monitor_status":
        next.status = mapStatus(series.value);
        break;
      case "monitor_response_time":
        next.latencyMs = mapLatency(series.value);
        break;
      case "monitor_uptime_ratio":
        next.uptimePercent = mapUptimePercent(series.value);
        break;
      default: {
        const _exhaustive: never = series.metric;
        invalid(String(_exhaustive));
      }
    }
    joined.set(key, next);
  }
  const monitors: UptimeKumaMonitorDto[] = [];
  for (const item of joined.values()) {
    if (item.status === undefined) invalid("Uptime Kuma monitor is missing monitor_status");
    monitors.push({
      id: item.id,
      name: item.name,
      status: item.status,
      latencyMs: item.latencyMs,
      uptimePercent: item.uptimePercent,
    });
  }
  const truncated = monitors.length > UPTIME_KUMA_MONITORS_MAX;
  return {
    monitors: truncated ? monitors.slice(0, UPTIME_KUMA_MONITORS_MAX) : monitors,
    truncated,
  };
}

function countBy(
  monitors: readonly UptimeKumaMonitorDto[],
  status: UptimeKumaMonitorStatus,
): number {
  return monitors.filter((monitor) => monitor.status === status).length;
}

export function assembleMonitorsDto(
  monitors: readonly UptimeKumaMonitorDto[],
  truncated: boolean,
): UptimeKumaMonitorsDto {
  return {
    monitors,
    truncated,
    monitorCount: monitors.length,
    upCount: countBy(monitors, "up"),
    downCount: countBy(monitors, "down"),
    pendingCount: countBy(monitors, "pending"),
    maintenanceCount: countBy(monitors, "maintenance"),
  };
}
