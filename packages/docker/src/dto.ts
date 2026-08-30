import type { DockerContainerState, DockerHealthStatus, DockerPortBinding } from "./types";

const CONTAINER_STATES: readonly DockerContainerState[] = [
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
  "unknown",
];

const MAX_PORTS = 16;
const MAX_STATUS_TEXT = 160;
const MAX_NAMES = 8;
const MAX_NAME_LENGTH = 128;

function isContainerState(value: string): value is DockerContainerState {
  return CONTAINER_STATES.includes(value as DockerContainerState);
}

export function normalizeContainerState(value: string | undefined): DockerContainerState {
  if (!value) return "unknown";
  const normalized = value.trim().toLocaleLowerCase("und");
  return isContainerState(normalized) ? normalized : "unknown";
}

export function normalizeHealthStatus(
  value: string | undefined,
  present: boolean,
): DockerHealthStatus {
  if (!present) return "none";
  if (!value) return "unknown";
  switch (value.trim().toLocaleLowerCase("und")) {
    case "healthy":
      return "healthy";
    case "unhealthy":
      return "unhealthy";
    case "starting":
      return "starting";
    case "none":
      return "none";
    default:
      return "unknown";
  }
}

export function shortContainerId(id: string): string {
  return id.slice(0, 12);
}

export function normalizeContainerNames(names: readonly string[] | undefined): readonly string[] {
  return (names ?? [])
    .map((name) => name.replace(/^\/+/u, "").trim().slice(0, MAX_NAME_LENGTH))
    .filter((name) => name.length > 0)
    .slice(0, MAX_NAMES);
}

export function normalizePrimaryName(name: string | undefined, names: readonly string[]): string {
  const cleaned = name?.replace(/^\/+/u, "").trim() ?? "";
  return cleaned || names[0] || shortContainerId(names[0] ?? "");
}

export function createdAtFromUnix(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseDockerTimestamp(value: string | undefined): string | null {
  if (!value || value.startsWith("0001-01-01")) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function computeUptimeSeconds(
  state: DockerContainerState,
  startedAt: string | null,
  now = Date.now(),
): number | null {
  if (state !== "running" || !startedAt) return null;
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return null;
  const seconds = Math.floor((now - started) / 1000);
  return seconds >= 0 ? seconds : null;
}

export function boundStatusText(value: string | undefined): string {
  return (value ?? "").trim().slice(0, MAX_STATUS_TEXT);
}

function normalizeProtocol(value: string | undefined): DockerPortBinding["protocol"] {
  const normalized = value?.trim().toLocaleLowerCase("und");
  if (normalized === "tcp" || normalized === "udp") return normalized;
  return "unknown";
}

export function mapListPorts(raw: unknown): readonly DockerPortBinding[] {
  if (!Array.isArray(raw)) return [];
  const ports: DockerPortBinding[] = [];
  for (const entry of raw.slice(0, MAX_PORTS)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const privatePort = record.PrivatePort;
    if (typeof privatePort !== "number" || !Number.isInteger(privatePort)) continue;
    if (privatePort < 1 || privatePort > 65535) continue;
    const publicPort = typeof record.PublicPort === "number" ? record.PublicPort : null;
    ports.push({
      privatePort,
      publicPort:
        publicPort !== null &&
        Number.isInteger(publicPort) &&
        publicPort >= 1 &&
        publicPort <= 65535
          ? publicPort
          : null,
      protocol: normalizeProtocol(typeof record.Type === "string" ? record.Type : undefined),
      hostIp:
        typeof record.IP === "string" && record.IP.trim() ? record.IP.trim().slice(0, 64) : null,
    });
  }
  return Object.freeze(ports);
}

export function mapInspectPorts(networkSettings: unknown): readonly DockerPortBinding[] {
  if (!networkSettings || typeof networkSettings !== "object") return [];
  const portsRaw = (networkSettings as { Ports?: unknown }).Ports;
  if (!portsRaw || typeof portsRaw !== "object") return [];
  const ports: DockerPortBinding[] = [];
  for (const [key, bindings] of Object.entries(portsRaw as Record<string, unknown>)) {
    if (ports.length >= MAX_PORTS) break;
    const [privateRaw, protocolRaw] = key.split("/");
    const privatePort = Number(privateRaw);
    if (!Number.isInteger(privatePort) || privatePort < 1 || privatePort > 65535) continue;
    const protocol = normalizeProtocol(protocolRaw);
    if (!Array.isArray(bindings) || bindings.length === 0) {
      ports.push({ privatePort, publicPort: null, protocol, hostIp: null });
      continue;
    }
    for (const binding of bindings.slice(0, 4)) {
      if (ports.length >= MAX_PORTS) break;
      if (!binding || typeof binding !== "object") continue;
      const record = binding as Record<string, unknown>;
      const publicRaw = Number(record.HostPort);
      ports.push({
        privatePort,
        publicPort:
          Number.isInteger(publicRaw) && publicRaw >= 1 && publicRaw <= 65535 ? publicRaw : null,
        protocol,
        hostIp:
          typeof record.HostIp === "string" && record.HostIp.trim()
            ? record.HostIp.trim().slice(0, 64)
            : null,
      });
    }
  }
  return Object.freeze(ports);
}

export function assertSafeDto(value: unknown): void {
  const serialized = JSON.stringify(value);
  const forbidden = ["Env", "Labels", "Mounts", "HostConfig", "Command", "PASSWORD", "SECRET"];
  for (const token of forbidden)
    if (serialized.includes(`"${token}"`) || serialized.includes(`${token}=`))
      throw new Error(`Unsafe Docker DTO leaked ${token}`);
}
