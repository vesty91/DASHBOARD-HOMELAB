import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  ProxmoxClusterDto,
  ProxmoxGuestsDto,
  ProxmoxNodeDto,
  ProxmoxNodeStatus,
  ProxmoxNodesDto,
  ProxmoxStorageDto,
  ProxmoxVersionDto,
} from "./types";

export const PROXMOX_NODES_MAX = 64;
export const PROXMOX_RESOURCES_MAX = 2_000;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Proxmox returned invalid JSON");
  }
}

export function unwrapProxmoxData(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid("Proxmox JSON envelope is invalid");
  const record = value as Record<string, unknown>;
  if (!("data" in record)) invalid("Proxmox JSON envelope is missing data");
  return record.data;
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

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || !Number.isSafeInteger(parsed)) return null;
  return parsed;
}

function parseRatio(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 1) return null;
  return parsed;
}

function parseQuorate(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return null;
}

function mapNodeStatus(value: unknown, online: unknown): ProxmoxNodeStatus {
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase("und");
    if (normalized === "online") return "online";
    if (normalized === "offline") return "offline";
  }
  if (online === 1 || online === true || online === "1") return "online";
  if (online === 0 || online === false || online === "0") return "offline";
  return "unknown";
}

export function mapVersion(
  value: unknown,
  secretValues: readonly string[] = [],
): ProxmoxVersionDto {
  const data = unwrapProxmoxData(value);
  if (!data || typeof data !== "object" || Array.isArray(data))
    invalid("Proxmox version payload is invalid");
  const record = data as Record<string, unknown>;
  return {
    version: redactText(boundText(record.version, 64), secretValues),
    release: redactText(boundText(record.release, 64), secretValues),
  };
}

export function mapClusterStatus(
  value: unknown,
  secretValues: readonly string[] = [],
): ProxmoxClusterDto {
  const data = unwrapProxmoxData(value);
  if (!Array.isArray(data)) invalid("Proxmox cluster status payload is invalid");
  if (data.length > PROXMOX_RESOURCES_MAX) invalid("Proxmox cluster status payload is oversized");
  let name: string | null = null;
  let quorate: boolean | null = null;
  let nodeCount = 0;
  let onlineNodeCount = 0;
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Proxmox cluster status entry is invalid");
    const record = entry as Record<string, unknown>;
    const type = boundText(record.type, 32);
    if (type === "cluster") {
      name = redactText(boundText(record.name, 64), secretValues);
      quorate = parseQuorate(record.quorate);
      continue;
    }
    if (type === "node") {
      nodeCount += 1;
      if (mapNodeStatus(record.status, record.online) === "online") onlineNodeCount += 1;
    }
  }
  return { name, quorate, nodeCount, onlineNodeCount };
}

function mapNode(record: Record<string, unknown>, secretValues: readonly string[]): ProxmoxNodeDto {
  const rawName = boundText(record.node, 64) ?? boundText(record.id, 64);
  const name = redactText(rawName, secretValues) ?? "node";
  const id = name.replaceAll(/[^A-Za-z0-9._-]/gu, "_").slice(0, 64) || "node";
  return {
    id,
    name,
    status: mapNodeStatus(record.status, record.online),
    cpuRatio: parseRatio(record.cpu),
    memoryUsedBytes: parseNonNegativeInteger(record.mem),
    memoryTotalBytes: parseNonNegativeInteger(record.maxmem),
    uptimeSeconds: parseNonNegativeInteger(record.uptime),
  };
}

export function mapClusterResources(
  value: unknown,
  secretValues: readonly string[] = [],
): {
  nodes: ProxmoxNodesDto;
  guests: ProxmoxGuestsDto;
  storage: ProxmoxStorageDto;
} {
  const data = unwrapProxmoxData(value);
  if (!Array.isArray(data)) invalid("Proxmox cluster resources payload is invalid");
  if (data.length > PROXMOX_RESOURCES_MAX)
    invalid("Proxmox cluster resources payload is oversized");
  const nodes: ProxmoxNodeDto[] = [];
  const seenNodes = new Set<string>();
  let vmCount = 0;
  let vmRunning = 0;
  let lxcCount = 0;
  let lxcRunning = 0;
  let storageCount = 0;
  let usedBytes = 0;
  let totalBytes = 0;
  let hasStorageUsage = false;
  for (const entry of data) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("Proxmox cluster resource is invalid");
    const record = entry as Record<string, unknown>;
    const type = boundText(record.type, 32);
    if (type === "node") {
      const mapped = mapNode(record, secretValues);
      if (seenNodes.has(mapped.id)) invalid("Proxmox node ids collided after sanitizing");
      seenNodes.add(mapped.id);
      nodes.push(mapped);
      continue;
    }
    if (type === "qemu") {
      vmCount += 1;
      if (mapNodeStatus(record.status, undefined) === "online" || record.status === "running")
        vmRunning += 1;
      continue;
    }
    if (type === "lxc") {
      lxcCount += 1;
      if (mapNodeStatus(record.status, undefined) === "online" || record.status === "running")
        lxcRunning += 1;
      continue;
    }
    if (type === "storage") {
      storageCount += 1;
      const used = parseNonNegativeInteger(record.disk);
      const total = parseNonNegativeInteger(record.maxdisk);
      if (used !== null) {
        usedBytes += used;
        hasStorageUsage = true;
      }
      if (total !== null) {
        totalBytes += total;
        hasStorageUsage = true;
      }
    }
  }
  const truncated = nodes.length > PROXMOX_NODES_MAX;
  return {
    nodes: {
      nodes: truncated ? nodes.slice(0, PROXMOX_NODES_MAX) : nodes,
      truncated,
    },
    guests: { vmCount, vmRunning, lxcCount, lxcRunning },
    storage: {
      storageCount,
      usedBytes: hasStorageUsage ? usedBytes : null,
      totalBytes: hasStorageUsage ? totalBytes : null,
    },
  };
}
