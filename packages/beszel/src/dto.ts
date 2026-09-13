import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import {
  beszelAuthResponseSchema,
  beszelSystemRecordSchema,
  beszelSystemsPageSchema,
} from "./schemas";
import type { BeszelHostDto, BeszelHostStatus, BeszelHostsDto } from "./types";

export function parseJsonObject(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Beszel returned invalid JSON");
  }
}

function safeText(value: string | undefined, secretValues: readonly string[]): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  const redacted = redactKnownSecretValues(trimmed, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

export function parseAuthToken(payload: unknown): string {
  const parsed = beszelAuthResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new IntegrationError("INVALID_RESPONSE", "Beszel auth response is invalid");
  return parsed.data.token;
}

export function mapHost(record: unknown, secretValues: readonly string[] = []): BeszelHostDto {
  const parsed = beszelSystemRecordSchema.safeParse(record);
  if (!parsed.success)
    throw new IntegrationError("INVALID_RESPONSE", "Beszel system record is invalid");
  const info = parsed.data.info;
  const status: BeszelHostStatus = parsed.data.status;
  return {
    id: parsed.data.id,
    name: safeText(parsed.data.name, secretValues) ?? parsed.data.id,
    host: safeText(parsed.data.host, secretValues),
    status,
    updatedAt: safeText(parsed.data.updated, secretValues),
    cpuPercent: info?.cpu ?? null,
    memoryPercent: info?.mp ?? null,
    diskPercent: info?.dp ?? null,
    networkBytes: info?.bb ?? null,
    agentVersion: safeText(info?.v, secretValues),
  };
}

function countBy(hosts: readonly BeszelHostDto[], status: BeszelHostStatus): number {
  return hosts.filter((host) => host.status === status).length;
}

export function mapHostsPage(
  payload: unknown,
  expectedPage: number,
  expectedPerPage: number,
  secretValues: readonly string[] = [],
): { hosts: BeszelHostDto[]; page: number; perPage: number; totalPages: number | null } {
  const parsed = beszelSystemsPageSchema.safeParse(payload);
  if (!parsed.success)
    throw new IntegrationError("INVALID_RESPONSE", "Beszel systems page is invalid");
  if (parsed.data.page !== expectedPage || parsed.data.perPage !== expectedPerPage)
    throw new IntegrationError("INVALID_RESPONSE", "Beszel systems page is inconsistent");
  if (parsed.data.items.length > expectedPerPage)
    throw new IntegrationError("INVALID_RESPONSE", "Beszel systems page exceeds perPage");
  return {
    hosts: parsed.data.items.map((item) => mapHost(item, secretValues)),
    page: parsed.data.page,
    perPage: parsed.data.perPage,
    totalPages: parsed.data.totalPages ?? null,
  };
}

export function assembleHostsDto(
  hosts: readonly BeszelHostDto[],
  truncated: boolean,
): BeszelHostsDto {
  return {
    hosts,
    truncated,
    hostCount: hosts.length,
    upCount: countBy(hosts, "up"),
    downCount: countBy(hosts, "down"),
    pausedCount: countBy(hosts, "paused"),
    pendingCount: countBy(hosts, "pending"),
  };
}
