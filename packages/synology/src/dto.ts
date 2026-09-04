import { IntegrationError } from "@dashboard/integrations";
import { z } from "zod";
import type {
  SynologyDiskDto,
  SynologyResourcesDto,
  SynologySystemDto,
  SynologyVolumeDto,
} from "./types";

const MAX_ID = 64;
const MAX_NAME = 120;
const MAX_VERSION = 64;
const MAX_MODEL = 120;
const MAX_STATUS = 32;
const MAX_VOLUMES = 256;
const MAX_DISKS = 64;
const KIB = 1024;
const MIB = 1024 * 1024;
const TEMP_MIN = -20;
const TEMP_MAX = 150;

export function boundText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function parseSafeIntegerBytes(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return value;
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value)) return null;
  try {
    const parsed = BigInt(value);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(parsed);
  } catch {
    return null;
  }
}

export function mbToBytes(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || !Number.isFinite(parsed * MIB)) return null;
  const bytes = parsed * MIB;
  if (!Number.isSafeInteger(bytes)) return null;
  return bytes;
}

export function kibToBytes(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || !Number.isFinite(parsed * KIB)) return null;
  const bytes = Math.floor(parsed * KIB);
  if (!Number.isSafeInteger(bytes)) return null;
  return bytes;
}

export function parseUptimeSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const parts = trimmed.split(":");
  if (parts.length === 3) {
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    const seconds = Number(parts[2]);
    if (![hours, minutes, seconds].every((part) => Number.isInteger(part) && part >= 0))
      return null;
    return hours * 3600 + minutes * 60 + seconds;
  }
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.floor(asNumber);
  return null;
}

export function parseTemperatureC(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < TEMP_MIN || parsed > TEMP_MAX) return null;
  return parsed;
}

export function parsePercentLoad(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 100) return null;
  return parsed;
}

export function sanitizeId(value: unknown, fallback: string): string {
  const raw = boundText(value, MAX_ID);
  if (!raw) return fallback;
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/gu, "_");
  return cleaned.slice(0, MAX_ID) || fallback;
}

export function normalizeStatus(value: unknown): string {
  const raw = boundText(value, MAX_STATUS);
  if (!raw) return "unknown";
  const normalized = raw.toLocaleLowerCase("und").replaceAll(" ", "_");
  if (normalized === "ok" || normalized === "good" || normalized === "healthy") return "normal";
  if (normalized === "attention" || normalized === "failing") return "degraded";
  if (normalized === "crashed" || normalized === "error" || normalized === "failed")
    return "critical";
  return raw.length > MAX_STATUS ? raw.slice(0, MAX_STATUS) : raw;
}

const VOLUME_IDENTITY_KEYS = ["id", "num_id", "name", "vol_desc", "desc"] as const;
const DISK_IDENTITY_KEYS = ["id", "name", "diskPath"] as const;

const dsmIdentityValueSchema = z.union([z.string(), z.number()]);

const dsmVolumeElementSchema = z
  .object({
    id: dsmIdentityValueSchema.optional(),
    num_id: dsmIdentityValueSchema.optional(),
    name: dsmIdentityValueSchema.optional(),
    vol_desc: dsmIdentityValueSchema.optional(),
    desc: dsmIdentityValueSchema.optional(),
  })
  .passthrough();

const dsmDiskElementSchema = z
  .object({
    id: dsmIdentityValueSchema.optional(),
    name: dsmIdentityValueSchema.optional(),
    diskPath: dsmIdentityValueSchema.optional(),
  })
  .passthrough();

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function mapSystemInfo(dsmInfo: unknown, coreSystem?: unknown): SynologySystemDto {
  const info = recordOf(dsmInfo);
  const core = recordOf(coreSystem);
  const cpuCores = parseFiniteNumber(core.cpu_cores ?? core.cpuCores);
  return {
    model: boundText(info.model ?? core.model, MAX_MODEL),
    dsmVersion: boundText(
      info.version_string ?? info.versionString ?? info.firmware_ver ?? core.firmware_ver,
      MAX_VERSION,
    ),
    uptimeSeconds: parseUptimeSeconds(info.uptime ?? info.up_time ?? core.up_time ?? core.uptime),
    systemTemperatureC: parseTemperatureC(
      info.temperature ?? info.sys_temp ?? core.sys_temp ?? core.temperature,
    ),
    temperatureWarning:
      typeof info.temperature_warn === "boolean"
        ? info.temperature_warn
        : typeof core.temperature_warn === "boolean"
          ? core.temperature_warn
          : null,
    ramTotalBytes: mbToBytes(info.ram ?? info.ram_mb),
    cpuCores: cpuCores !== null && Number.isInteger(cpuCores) && cpuCores > 0 ? cpuCores : null,
    cpuFamily: boundText(core.cpu_family ?? core.cpuFamily, MAX_MODEL),
    cpuSeries: boundText(core.cpu_series ?? core.cpuSeries, MAX_MODEL),
  };
}

export function emptyResources(): SynologyResourcesDto {
  return {
    cpuTotalPercent: null,
    cpuUserPercent: null,
    cpuSystemPercent: null,
    cpuOtherPercent: null,
    memoryTotalBytes: null,
    memoryAvailableBytes: null,
    memoryUsedBytes: null,
    memoryPercentUsed: null,
    swapTotalBytes: null,
    swapUsedPercent: null,
  };
}

function invalidPayload(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

function requireObjectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidPayload(message);
  return value as Record<string, unknown>;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] | undefined {
  if (!(key in record)) return undefined;
  if (!Array.isArray(record[key])) invalidPayload("DSM storage payload is invalid");
  return record[key] as unknown[];
}

export function parseStoragePayload(raw: unknown): { volumes: unknown; disks: unknown } {
  const record = requireObjectRecord(raw, "DSM storage payload is invalid");
  const volumes = arrayField(record, "volumes");
  const disks = arrayField(record, "disks");
  const volInfo = arrayField(record, "vol_info");
  const hddInfo = arrayField(record, "hdd_info");
  const modern = volumes !== undefined && disks !== undefined;
  const legacy = volInfo !== undefined && hddInfo !== undefined;
  if (modern && volInfo === undefined && hddInfo === undefined) return { volumes, disks };
  if (legacy && volumes === undefined && disks === undefined)
    return { volumes: volInfo, disks: hddInfo };
  invalidPayload("DSM storage payload is invalid");
}

export function validateCpuLoads(cpu: Record<string, unknown>): {
  user: number;
  system: number;
  other: number;
  total: number;
} {
  const user = parsePercentLoad(cpu.user_load);
  const system = parsePercentLoad(cpu.system_load);
  const other = parsePercentLoad(cpu.other_load);
  if (user === null || system === null || other === null)
    invalidPayload("DSM utilization CPU is invalid");
  const total = user + system + other;
  if (!Number.isFinite(total) || total < 0 || total > 100)
    invalidPayload("DSM utilization CPU is invalid");
  return { user, system, other, total };
}

export function validateMemoryTotals(memory: Record<string, unknown>): {
  availableBytes: number;
  totalBytes: number;
} {
  const availableBytes = kibToBytes(memory.avail_real);
  const totalBytes = kibToBytes(memory.total_real ?? memory.memory_size);
  if (
    availableBytes === null ||
    totalBytes === null ||
    totalBytes <= 0 ||
    availableBytes > totalBytes
  )
    invalidPayload("DSM utilization memory is invalid");
  return { availableBytes, totalBytes };
}

export function parseUtilizationPayload(raw: unknown): unknown {
  const record = requireObjectRecord(raw, "DSM utilization payload is invalid");
  const cpu = requireObjectRecord(record.cpu, "DSM utilization CPU is invalid");
  const memory = requireObjectRecord(record.memory, "DSM utilization memory is invalid");
  validateCpuLoads(cpu);
  validateMemoryTotals(memory);
  return record;
}

export function parseCoreSystemPayload(raw: unknown): Record<string, unknown> {
  return requireObjectRecord(raw, "DSM Core.System payload is invalid");
}

export function parseDsmInfoPayload(raw: unknown): Record<string, unknown> {
  return requireObjectRecord(raw, "DSM.Info payload is invalid");
}

export function assertUsefulSystemInfo(dto: SynologySystemDto): void {
  if (
    dto.model === null &&
    dto.dsmVersion === null &&
    dto.uptimeSeconds === null &&
    dto.systemTemperatureC === null &&
    dto.temperatureWarning === null &&
    dto.ramTotalBytes === null
  )
    invalidPayload("DSM.Info payload is incomplete");
}

export function mapResources(raw: unknown): SynologyResourcesDto {
  const record = recordOf(raw);
  const cpu = recordOf(record.cpu);
  const memory = recordOf(record.memory);
  const { user, system, other, total } = validateCpuLoads(cpu);
  const { availableBytes, totalBytes } = validateMemoryTotals(memory);
  const memoryUsedBytes = totalBytes - availableBytes;
  return {
    cpuTotalPercent: total,
    cpuUserPercent: user,
    cpuSystemPercent: system,
    cpuOtherPercent: other,
    memoryTotalBytes: totalBytes,
    memoryAvailableBytes: availableBytes,
    memoryUsedBytes,
    memoryPercentUsed: (memoryUsedBytes / totalBytes) * 100,
    swapTotalBytes: kibToBytes(memory.total_swap),
    swapUsedPercent: parsePercentLoad(memory.swap_usage),
  };
}

export function assertUsefulResources(dto: SynologyResourcesDto): void {
  if (
    dto.cpuUserPercent === null ||
    dto.cpuSystemPercent === null ||
    dto.cpuOtherPercent === null ||
    dto.cpuTotalPercent === null ||
    dto.memoryTotalBytes === null ||
    dto.memoryAvailableBytes === null ||
    dto.memoryUsedBytes === null ||
    dto.memoryPercentUsed === null
  )
    invalidPayload("DSM utilization payload is incomplete");
}

function volumeFree(
  usedBytes: number | null,
  totalBytes: number | null,
): { freeBytes: number | null; usedPercent: number | null } {
  if (usedBytes === null || totalBytes === null || totalBytes <= 0 || usedBytes > totalBytes)
    return { freeBytes: null, usedPercent: null };
  return {
    freeBytes: totalBytes - usedBytes,
    usedPercent: (usedBytes / totalBytes) * 100,
  };
}

function usefulIdentity(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return boundText(String(value), MAX_ID);
  if (typeof value === "string") return boundText(value, MAX_NAME);
  return null;
}

function requireStorageIdentity(record: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const identity = usefulIdentity(record[key]);
    if (identity) return identity;
  }
  invalidPayload("DSM storage item is invalid");
}

function parseStorageElement(
  value: unknown,
  schema: typeof dsmVolumeElementSchema | typeof dsmDiskElementSchema,
  keys: readonly string[],
): { record: Record<string, unknown>; identity: string } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) invalidPayload("DSM storage item is invalid");
  return { record: parsed.data, identity: requireStorageIdentity(parsed.data, keys) };
}

export function mapVolumes(raw: unknown): readonly SynologyVolumeDto[] {
  const items = Array.isArray(raw) ? raw : [];
  if (items.length > MAX_VOLUMES)
    throw new IntegrationError("INVALID_RESPONSE", "DSM returned too many volumes");
  return items.map((item) => {
    const { record, identity } = parseStorageElement(
      item,
      dsmVolumeElementSchema,
      VOLUME_IDENTITY_KEYS,
    );
    const size = recordOf(record.size);
    const totalBytes = parseSafeIntegerBytes(size.total ?? record.total_size);
    const usedBytes = parseSafeIntegerBytes(size.used ?? record.used_size);
    const id = sanitizeId(record.id ?? record.num_id ?? identity, identity);
    const name = boundText(record.vol_desc ?? record.desc ?? record.name, MAX_NAME) ?? id;
    return {
      id,
      name,
      filesystem: boundText(record.fs_type ?? record.filesystem ?? record.fsType, MAX_STATUS),
      raidType: boundText(record.raid_type ?? record.raidType ?? record.container, MAX_STATUS),
      status: normalizeStatus(record.status),
      totalBytes,
      usedBytes,
      temperatureC: parseTemperatureC(record.temp ?? record.temperature),
      ...volumeFree(usedBytes, totalBytes),
    };
  });
}

export function mapDisks(raw: unknown): readonly SynologyDiskDto[] {
  const items = Array.isArray(raw) ? raw : [];
  if (items.length > MAX_DISKS)
    throw new IntegrationError("INVALID_RESPONSE", "DSM returned too many disks");
  return items.map((item) => {
    const { record, identity } = parseStorageElement(
      item,
      dsmDiskElementSchema,
      DISK_IDENTITY_KEYS,
    );
    const id = sanitizeId(record.id ?? record.diskPath ?? record.name, identity);
    const displayName = boundText(record.name ?? record.id, MAX_NAME) ?? id;
    return {
      id,
      displayName,
      vendor: boundText(record.vendor, MAX_MODEL),
      model: boundText(record.model, MAX_MODEL),
      type: boundText(record.type ?? record.diskType, MAX_STATUS),
      status: normalizeStatus(record.status),
      smartStatus: boundText(record.smart_status ?? record.smartStatus, MAX_STATUS),
      temperatureC: parseTemperatureC(record.temp ?? record.temperature),
      sizeBytes: parseSafeIntegerBytes(record.size_total ?? record.size ?? record.total_size),
      badSectorWarning:
        typeof record.bad_sector === "boolean"
          ? record.bad_sector
          : typeof record.exceed_bad_sector_thr === "boolean"
            ? record.exceed_bad_sector_thr
            : null,
      remainingLifeWarning:
        typeof record.remain_life_warning === "boolean" ? record.remain_life_warning : null,
    };
  });
}

export function storageLooksDegraded(
  volumes: readonly SynologyVolumeDto[],
  disks: readonly SynologyDiskDto[],
): boolean {
  const bad = new Set(["degraded", "warning", "critical", "crashed", "error", "failed"]);
  return (
    volumes.some((volume) => bad.has(volume.status.toLocaleLowerCase("und"))) ||
    disks.some((disk) => bad.has(disk.status.toLocaleLowerCase("und")))
  );
}
