import type { DockerContainerStats } from "./types";

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPath(source: unknown, path: readonly string[]): unknown {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function sumSafe(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue;
    total += value;
  }
  return Number.isFinite(total) ? total : null;
}

/**
 * CPU percent uses Docker Engine deltas:
 * (cpu_delta / system_cpu_delta) * online_cpus * 100.
 * Missing or zero deltas return null — never a fake 0%.
 */
export function computeCpuPercent(stats: unknown): number | null {
  const total = finiteNumber(readPath(stats, ["cpu_stats", "cpu_usage", "total_usage"]));
  const preTotal = finiteNumber(readPath(stats, ["precpu_stats", "cpu_usage", "total_usage"]));
  const system = finiteNumber(readPath(stats, ["cpu_stats", "system_cpu_usage"]));
  const preSystem = finiteNumber(readPath(stats, ["precpu_stats", "system_cpu_usage"]));
  if (total === null || preTotal === null || system === null || preSystem === null) return null;
  const cpuDelta = total - preTotal;
  const systemDelta = system - preSystem;
  if (cpuDelta <= 0 || systemDelta <= 0) return null;
  const online = finiteNumber(readPath(stats, ["cpu_stats", "online_cpus"]));
  const perCpu = readPath(stats, ["cpu_stats", "cpu_usage", "percpu_usage"]);
  const cpuCount = online && online > 0 ? online : Array.isArray(perCpu) ? perCpu.length : null;
  if (!cpuCount || cpuCount <= 0) return null;
  const percent = (cpuDelta / systemDelta) * cpuCount * 100;
  return Number.isFinite(percent) && percent >= 0 ? percent : null;
}

/**
 * Memory working set:
 * - cgroup v1: usage - cache
 * - cgroup v2: usage - inactive_file
 * - fallback: usage
 * Percent is null when the limit is missing, zero, or invalid.
 */
export function computeMemory(stats: unknown): {
  usage: number | null;
  limit: number | null;
  percent: number | null;
} {
  const usage = finiteNumber(readPath(stats, ["memory_stats", "usage"]));
  const limit = finiteNumber(readPath(stats, ["memory_stats", "limit"]));
  const cache = finiteNumber(readPath(stats, ["memory_stats", "stats", "cache"]));
  const inactiveFile = finiteNumber(readPath(stats, ["memory_stats", "stats", "inactive_file"]));
  let workingSet = usage;
  if (usage !== null && cache !== null && cache >= 0 && cache <= usage) workingSet = usage - cache;
  else if (usage !== null && inactiveFile !== null && inactiveFile >= 0 && inactiveFile <= usage)
    workingSet = usage - inactiveFile;
  const safeLimit = limit !== null && limit > 0 ? limit : null;
  const percent =
    workingSet !== null && safeLimit !== null && Number.isFinite(workingSet / safeLimit)
      ? (workingSet / safeLimit) * 100
      : null;
  return {
    usage: workingSet,
    limit: safeLimit,
    percent: percent !== null && Number.isFinite(percent) && percent >= 0 ? percent : null,
  };
}

export function computeNetwork(stats: unknown): { rx: number | null; tx: number | null } {
  const networks = readPath(stats, ["networks"]);
  if (!networks || typeof networks !== "object") return { rx: null, tx: null };
  const rx: number[] = [];
  const tx: number[] = [];
  for (const entry of Object.values(networks as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const received = finiteNumber(record.rx_bytes);
    const sent = finiteNumber(record.tx_bytes);
    if (received !== null) rx.push(received);
    if (sent !== null) tx.push(sent);
  }
  return { rx: sumSafe(rx), tx: sumSafe(tx) };
}

export function computeBlockIo(stats: unknown): { read: number | null; write: number | null } {
  const entries = readPath(stats, ["blkio_stats", "io_service_bytes_recursive"]);
  if (!Array.isArray(entries)) return { read: null, write: null };
  const read: number[] = [];
  const write: number[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const op = typeof record.op === "string" ? record.op.trim().toLocaleLowerCase("und") : "";
    const value = finiteNumber(record.value);
    if (value === null) continue;
    if (op === "read") read.push(value);
    if (op === "write") write.push(value);
  }
  return { read: sumSafe(read), write: sumSafe(write) };
}

export function mapContainerStats(stats: unknown): DockerContainerStats {
  const cpuPercent = computeCpuPercent(stats);
  const memory = computeMemory(stats);
  const network = computeNetwork(stats);
  const block = computeBlockIo(stats);
  return {
    cpuPercent,
    memoryUsageBytes: memory.usage,
    memoryLimitBytes: memory.limit,
    memoryPercent: memory.percent,
    networkRxBytes: network.rx,
    networkTxBytes: network.tx,
    blockReadBytes: block.read,
    blockWriteBytes: block.write,
  };
}
