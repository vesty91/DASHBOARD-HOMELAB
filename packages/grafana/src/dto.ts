import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  GrafanaAlertsDto,
  GrafanaDashboardsDto,
  GrafanaDatabaseStatus,
  GrafanaDatasourcesDto,
  GrafanaDatasourceTypeTally,
  GrafanaFoldersDto,
  GrafanaHealthDto,
} from "./types";

export const GRAFANA_SEARCH_LIMIT = 100;
export const GRAFANA_FOLDERS_LIMIT = 100;
export const GRAFANA_ALERTS_MAX = 2_000;
export const GRAFANA_DATASOURCES_MAX = 2_000;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Grafana returned invalid JSON");
  }
}

function boundText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function redactText(value: string | null, secretValues: readonly string[]): string | null {
  if (value === null) return null;
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function parseDatabase(value: unknown): GrafanaDatabaseStatus {
  if (value === "ok") return "ok";
  if (value === "failing") return "failing";
  invalid("Grafana health database status is invalid");
}

export function mapHealth(value: unknown, secretValues: readonly string[] = []): GrafanaHealthDto {
  const record = asRecord(value, "Grafana health payload is invalid");
  return {
    version: redactText(boundText(record.version, 64), secretValues),
    database: parseDatabase(record.database),
  };
}

function mapCountedList(
  value: unknown,
  limit: number,
  invalidMessage: string,
  oversizedMessage: string,
): { count: number; truncated: boolean } {
  if (!Array.isArray(value)) invalid(invalidMessage);
  if (value.length > limit) invalid(oversizedMessage);
  for (const entry of value)
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid(invalidMessage);
  return { count: value.length, truncated: value.length === limit };
}

export function mapSearch(value: unknown): GrafanaDashboardsDto {
  return mapCountedList(
    value,
    GRAFANA_SEARCH_LIMIT,
    "Grafana search payload is invalid",
    "Grafana search payload is oversized",
  );
}

export function mapFolders(value: unknown): GrafanaFoldersDto {
  return mapCountedList(
    value,
    GRAFANA_FOLDERS_LIMIT,
    "Grafana folders payload is invalid",
    "Grafana folders payload is oversized",
  );
}

function classifyAlertState(value: unknown): keyof GrafanaAlertsDto {
  const normalized = boundText(value, 32)?.toLocaleLowerCase("und");
  if (normalized === "firing" || normalized === "alerting") return "firing";
  if (normalized === "pending") return "pending";
  if (normalized === "inactive" || normalized === "normal") return "inactive";
  return "other";
}

export function mapAlerts(value: unknown): GrafanaAlertsDto {
  const root = asRecord(value, "Grafana alerts payload is invalid");
  const data = asRecord(root.data, "Grafana alerts payload is invalid");
  if (!Array.isArray(data.alerts)) invalid("Grafana alerts payload is invalid");
  if (data.alerts.length > GRAFANA_ALERTS_MAX) invalid("Grafana alerts payload is oversized");
  const counts = { firing: 0, pending: 0, inactive: 0, other: 0 };
  for (const entry of data.alerts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Grafana alert entry is invalid");
    const state = classifyAlertState((entry as Record<string, unknown>).state);
    counts[state] += 1;
  }
  return counts;
}

export function mapDatasources(
  value: unknown,
  secretValues: readonly string[] = [],
): GrafanaDatasourcesDto {
  if (!Array.isArray(value)) invalid("Grafana datasources payload is invalid");
  if (value.length > GRAFANA_DATASOURCES_MAX) invalid("Grafana datasources payload is oversized");
  const tallies = new Map<string, number>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Grafana datasource entry is invalid");
    const record = entry as Record<string, unknown>;
    const type = redactText(boundText(record.type, 64), secretValues) ?? "unknown";
    tallies.set(type, (tallies.get(type) ?? 0) + 1);
  }
  const types: GrafanaDatasourceTypeTally[] = [...tallies.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
    .map(([type, count]) => ({ type, count }));
  return { count: value.length, types };
}
