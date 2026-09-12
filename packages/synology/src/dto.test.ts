import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  assertUsefulResources,
  assertUsefulSystemInfo,
  emptyResources,
  kibToBytes,
  mapDisks,
  mapResources,
  mapSystemInfo,
  mapVolumes,
  mbToBytes,
  parseCoreSystemPayload,
  parseDsmInfoPayload,
  parseSafeIntegerBytes,
  parseStoragePayload,
  parseUptimeSeconds,
  parseUtilizationPayload,
  projectAccountSafeDisks,
  projectAccountSafeSystem,
  projectAccountSafeVolumes,
  redactAccountText,
  storageLooksDegraded,
  systemSectionStatus,
  rejectNegativeByteValue,
  rejectNonPositiveByteValue,
  validateCpuLoads,
  validateMemoryTotals,
  validateVolumeUsage,
} from "./dto";

describe("Synology DTO mapping", () => {
  it("maps DSM.Info RAM in MB and omits serials", () => {
    const mapped = mapSystemInfo(
      {
        model: "DS920+",
        version_string: "DSM 7.2.2-72806",
        uptime: "12:3:4",
        temperature: 42,
        serial: "SECRET-SERIAL",
        ram: 8192,
      },
      { cpu_cores: 4, cpu_family: "Intel", cpu_series: "J4125", serial: "CORE-SERIAL" },
    );
    expect(mapped).toEqual({
      model: "DS920+",
      dsmVersion: "DSM 7.2.2-72806",
      uptimeSeconds: 12 * 3600 + 3 * 60 + 4,
      systemTemperatureC: 42,
      temperatureWarning: null,
      ramTotalBytes: 8192 * 1024 * 1024,
      cpuCores: 4,
      cpuFamily: "Intel",
      cpuSeries: "J4125",
    });
    expect(JSON.stringify(mapped)).not.toMatch(/SECRET-SERIAL|CORE-SERIAL|passwd|sid/u);
  });

  it("maps utilization CPU as user+system+other and RAM from KB", () => {
    const mapped = mapResources({
      cpu: { user_load: 10, system_load: 5, other_load: 1, idle_load: 84 },
      memory: {
        total_real: 1024,
        avail_real: 256,
        real_usage: 75,
        total_swap: 512,
        swap_usage: 10,
      },
    });
    expect(mapped.cpuTotalPercent).toBe(16);
    expect(mapped.memoryTotalBytes).toBe(1024 * 1024);
    expect(mapped.memoryAvailableBytes).toBe(256 * 1024);
    expect(mapped.memoryUsedBytes).toBe(768 * 1024);
    expect(mapped.cpuTotalPercent).not.toBe(0);
    expect(() =>
      mapResources({
        cpu: { user_load: 90, system_load: 20, other_load: 5 },
        memory: { total_real: 1024, avail_real: 256 },
      }),
    ).toThrow(IntegrationError);
  });

  it("rejects inconsistent CPU aggregates and invalid memory totals", () => {
    const validMemory = { total_real: 4096, avail_real: 1024 };
    expect(() =>
      parseUtilizationPayload({
        cpu: { user_load: 100, system_load: 0, other_load: 0 },
        memory: validMemory,
      }),
    ).not.toThrow();
    expect(() =>
      parseUtilizationPayload({
        cpu: { user_load: 33.3, system_load: 33.3, other_load: 33.4 },
        memory: validMemory,
      }),
    ).not.toThrow();
    expect(validateCpuLoads({ user_load: 33.3, system_load: 33.3, other_load: 33.4 }).total).toBe(
      100,
    );
    expect(validateMemoryTotals({ total_real: 4096, avail_real: 4096 }).availableBytes).toBe(
      4096 * 1024,
    );
    for (const cpu of [
      { user_load: 60, system_load: 60, other_load: 0 },
      { user_load: 33.4, system_load: 33.4, other_load: 33.4 },
      { user_load: Number.NaN, system_load: 0, other_load: 0 },
      { user_load: Number.POSITIVE_INFINITY, system_load: 0, other_load: 0 },
      { user_load: -1, system_load: 0, other_load: 0 },
    ]) {
      expect(() => parseUtilizationPayload({ cpu, memory: validMemory })).toThrow(IntegrationError);
    }
    const validCpu = { user_load: 1, system_load: 1, other_load: 1 };
    expect(() =>
      parseUtilizationPayload({ cpu: validCpu, memory: { total_real: 4096, avail_real: 1024 } }),
    ).not.toThrow();
    for (const memory of [
      { total_real: 4096, avail_real: 5000 },
      { total_real: 0, avail_real: 0 },
      { avail_real: 1024 },
      { total_real: 4096 },
      { total_real: "nope", avail_real: 1 },
      { total_real: 4096, avail_real: Number.NaN },
    ]) {
      expect(() => parseUtilizationPayload({ cpu: validCpu, memory })).toThrow(IntegrationError);
    }
  });

  it("returns null for oversized integers instead of rounding", () => {
    expect(parseSafeIntegerBytes("9007199254740993")).toBeNull();
    expect(parseSafeIntegerBytes(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(mbToBytes(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(kibToBytes(-1)).toBeNull();
  });

  it("parses uptime and never leaks disk serials", () => {
    expect(parseUptimeSeconds("0:00:00")).toBe(0);
    expect(parseUptimeSeconds("1:02:03")).toBe(3723);
    expect(parseUptimeSeconds("12:3:4")).toBe(43384);
    expect(parseUptimeSeconds("24:00:00")).toBe(86400);
    expect(parseUptimeSeconds("100:59:59")).toBe(100 * 3600 + 59 * 60 + 59);
    expect(parseUptimeSeconds(90)).toBe(90);
    expect(parseUptimeSeconds("90")).toBe(90);
    expect(parseUptimeSeconds(0)).toBe(0);
    for (const invalid of [
      "1:60:00",
      "0:00:60",
      "0:00:99",
      "1:-1:00",
      "1:00:-1",
      "1:1.5:00",
      "1:00:1.5",
    ]) {
      expect(() => parseUptimeSeconds(invalid)).toThrow(IntegrationError);
      try {
        parseUptimeSeconds(invalid);
      } catch (error) {
        expect(error).toMatchObject({ code: "INVALID_RESPONSE" });
      }
    }
    const disks = mapDisks([
      {
        id: "sata1",
        name: "Drive 1",
        model: "WD80",
        size_total: "1000",
        status: "normal",
        temp: 31,
        serial: "DISK-SERIAL",
      },
    ]);
    expect(disks[0]?.smartStatus).toBeNull();
    expect(disks[0]?.temperatureC).toBe(31);
    expect(JSON.stringify(disks)).not.toMatch(/DISK-SERIAL/u);
    expect(mapDisks([{ id: "sata1", temp: 200 }])[0]?.temperatureC).toBeNull();
  });

  it("rejects oversized storage inventories", () => {
    expect(() =>
      mapVolumes(Array.from({ length: 257 }, (_, index) => ({ id: `v${index}` }))),
    ).toThrow(IntegrationError);
    expect(() => mapDisks(Array.from({ length: 65 }, (_, index) => ({ id: `d${index}` })))).toThrow(
      IntegrationError,
    );
  });

  it("rejects empty or non-object DSM.Info payloads", () => {
    expect(parseDsmInfoPayload({ model: "DS920+", ram: 4096 })).toEqual({
      model: "DS920+",
      ram: 4096,
    });
    for (const invalid of [undefined, null, "bad", []]) {
      expect(() => parseDsmInfoPayload(invalid)).toThrow(IntegrationError);
    }
    expect(() => assertUsefulSystemInfo(mapSystemInfo(parseDsmInfoPayload({})))).toThrow(
      IntegrationError,
    );
    expect(() =>
      assertUsefulSystemInfo(mapSystemInfo(parseDsmInfoPayload({ serial: "SECRET" }))),
    ).toThrow(IntegrationError);
  });

  it("rejects malformed storage array elements and keeps empty arrays valid", () => {
    expect(mapVolumes([])).toEqual([]);
    expect(mapDisks([])).toEqual([]);
    for (const invalid of [null, "disk", 42, [], {}, { unknown: "value" }, { foo: "bar" }]) {
      expect(() => mapVolumes([invalid])).toThrow(IntegrationError);
      expect(() => mapDisks([invalid])).toThrow(IntegrationError);
    }
    expect(mapVolumes([{ id: "volume_1" }])[0]?.id).toBe("volume_1");
    expect(mapVolumes([{ num_id: 2 }])[0]?.id).toBe("2");
    expect(mapVolumes([{ vol_desc: "Volume 1" }])[0]?.name).toBe("Volume 1");
    expect(mapDisks([{ name: "Drive 1" }])[0]?.displayName).toBe("Drive 1");
    expect(mapDisks([{ diskPath: "sata1" }])[0]?.id).toBe("sata1");
  });

  it("accepts modern and legacy storage envelopes and rejects malformed ones", () => {
    expect(parseStoragePayload({ volumes: [], disks: [] })).toEqual({ volumes: [], disks: [] });
    expect(parseStoragePayload({ vol_info: [{ id: "v1" }], hdd_info: [] })).toEqual({
      volumes: [{ id: "v1" }],
      disks: [],
    });
    for (const invalid of [
      {},
      { volumes: [] },
      { disks: [] },
      { volumes: {}, disks: [] },
      { volumes: [], disks: "bad" },
      { vol_info: null, hdd_info: [] },
      { volumes: [], disks: [], vol_info: [], hdd_info: [] },
    ]) {
      expect(() => parseStoragePayload(invalid)).toThrow(IntegrationError);
    }
  });

  it("accepts utilization payloads with numeric strings and rejects malformed ones", () => {
    expect(() =>
      parseUtilizationPayload({
        cpu: { user_load: "12", system_load: "3", other_load: "0" },
        memory: { total_real: "4096", avail_real: "1024" },
      }),
    ).not.toThrow();
    expect(() =>
      parseUtilizationPayload({
        cpu: { user_load: 12, system_load: 3, other_load: 0 },
        memory: { memory_size: 2048, avail_real: 512 },
      }),
    ).not.toThrow();
    for (const invalid of [
      {},
      { cpu: {} },
      { memory: {} },
      { cpu: {}, memory: {} },
      { cpu: null, memory: { total_real: 1, avail_real: 1 } },
      { cpu: { user_load: 1, system_load: 1, other_load: 1 }, memory: null },
      { cpu: "bad", memory: { total_real: 1, avail_real: 1 } },
      { cpu: { user_load: 1, system_load: 1, other_load: 1 }, memory: [] },
      { cpu: { user_load: 1, system_load: 1, other_load: 1 }, memory: { total_real: 1 } },
      { cpu: { user_load: 1, system_load: 1, other_load: 1 }, memory: { avail_real: 1 } },
      {
        cpu: { user_load: Number.NaN, system_load: 1, other_load: 1 },
        memory: { total_real: 1, avail_real: 1 },
      },
      {
        cpu: { user_load: 1, system_load: 1, other_load: 1 },
        memory: { total_real: Number.POSITIVE_INFINITY, avail_real: 1 },
      },
      {
        cpu: { user_load: "nope", system_load: 1, other_load: 1 },
        memory: { total_real: 1, avail_real: 1 },
      },
      {
        cpu: { user_load: 1, system_load: 1, other_load: 1 },
        memory: { total_real: 0, avail_real: 0 },
      },
    ]) {
      expect(() => parseUtilizationPayload(invalid)).toThrow(IntegrationError);
    }
  });

  it("rejects empty or unrecognized Core.System payloads and keeps useful zeros", () => {
    expect(parseCoreSystemPayload({ cpu_cores: 4 })).toEqual({ cpu_cores: 4 });
    expect(parseCoreSystemPayload({ cpu_family: "Intel" })).toEqual({ cpu_family: "Intel" });
    expect(parseCoreSystemPayload({ cpu_series: "J4125" })).toEqual({ cpu_series: "J4125" });
    expect(parseCoreSystemPayload({ sys_temp: 40 })).toEqual({ sys_temp: 40 });
    expect(parseCoreSystemPayload({ temperature_warn: false })).toEqual({
      temperature_warn: false,
    });
    expect(parseCoreSystemPayload({ up_time: 0 })).toEqual({ up_time: 0 });
    for (const invalid of [
      {},
      { foo: "bar" },
      { cpu_cores: "garbage" },
      { cpu_family: "" },
      { temperature: "not-a-number" },
    ]) {
      expect(() => parseCoreSystemPayload(invalid)).toThrow(IntegrationError);
    }
  });

  it("rejects resource DTOs that lost their aggregate fields", () => {
    const mapped = mapResources({
      cpu: { user_load: 10, system_load: 5, other_load: 1 },
      memory: { total_real: 1024, avail_real: 256 },
    });
    expect(() => assertUsefulResources(mapped)).not.toThrow();
    expect(() => assertUsefulResources(emptyResources())).toThrow(IntegrationError);
    expect(() =>
      assertUsefulResources({
        ...mapped,
        cpuTotalPercent: null,
      }),
    ).toThrow(IntegrationError);
    expect(() =>
      assertUsefulResources({
        ...mapped,
        memoryPercentUsed: null,
      }),
    ).toThrow(IntegrationError);
  });

  it("normalizes SMART statuses and degrades storage for disk health flags", () => {
    expect(mapDisks([{ id: "sata1", smart_status: "failing" }])[0]?.smartStatus).toBe("degraded");
    expect(mapDisks([{ id: "sata1", smart_status: "critical" }])[0]?.smartStatus).toBe("critical");
    expect(mapDisks([{ id: "sata1", smart_status: "unhealthy" }])[0]?.smartStatus).toBe("degraded");
    expect(mapDisks([{ id: "sata1", smart_status: "bad" }])[0]?.smartStatus).toBe("degraded");
    expect(mapDisks([{ id: "sata1" }])[0]?.smartStatus).toBeNull();
    const healthy = mapDisks([
      {
        id: "sata1",
        status: "normal",
        smart_status: "normal",
        bad_sector: false,
        remain_life_warning: false,
      },
    ]);
    expect(storageLooksDegraded([], healthy)).toBe(false);
    const missingFlags = mapDisks([{ id: "sata1", status: "normal" }]);
    expect(missingFlags[0]?.badSectorWarning).toBeNull();
    expect(missingFlags[0]?.remainingLifeWarning).toBeNull();
    expect(storageLooksDegraded([], missingFlags)).toBe(false);
    expect(
      storageLooksDegraded([], mapDisks([{ id: "sata1", status: "normal", bad_sector: true }])),
    ).toBe(true);
    expect(
      storageLooksDegraded(
        [],
        mapDisks([{ id: "sata1", status: "normal", remain_life_warning: true }]),
      ),
    ).toBe(true);
    expect(
      storageLooksDegraded(
        [],
        mapDisks([{ id: "sata1", status: "normal", smart_status: "failing" }]),
      ),
    ).toBe(true);
    expect(
      storageLooksDegraded(
        [],
        mapDisks([{ id: "sata1", status: "normal", smart_status: "critical" }]),
      ),
    ).toBe(true);
    expect(systemSectionStatus(mapSystemInfo({ model: "DS920+", temperature_warn: true }))).toBe(
      "degraded",
    );
    expect(systemSectionStatus(mapSystemInfo({ model: "DS920+", temperature_warn: false }))).toBe(
      "available",
    );
    expect(
      mapSystemInfo({ temperature_warn: false }, { temperature_warn: true }).temperatureWarning,
    ).toBe(true);
    expect(systemSectionStatus(mapSystemInfo({ model: "DS920+" }))).toBe("available");
  });

  it("rejects inconsistent volume usage and keeps missing sizes nullable", () => {
    const volume = (size: Record<string, unknown>) => ({ id: "volume_1", size });
    expect(mapVolumes([volume({ total: 1000, used: 0 })])[0]).toMatchObject({
      totalBytes: 1000,
      usedBytes: 0,
      freeBytes: 1000,
      usedPercent: 0,
    });
    expect(mapVolumes([volume({ total: 1000, used: 500 })])[0]).toMatchObject({
      freeBytes: 500,
      usedPercent: 50,
    });
    expect(mapVolumes([volume({ total: 1000, used: 1000 })])[0]).toMatchObject({
      freeBytes: 0,
      usedPercent: 100,
    });
    expect(() => mapVolumes([volume({ total: 1000, used: 1001 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: 0, used: 0 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: 0 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: "1000", used: "1001" })])).toThrow(IntegrationError);
    expect(() =>
      mapVolumes([
        volume({ total: 1000, used: 400 }),
        { id: "volume_2", size: { total: 1000, used: 1001 } },
      ]),
    ).toThrow(IntegrationError);
    const missingTotal = mapVolumes([volume({ used: 500 })])[0];
    expect(missingTotal?.usedBytes).toBe(500);
    expect(missingTotal?.totalBytes).toBeNull();
    expect(missingTotal?.freeBytes).toBeNull();
    expect(missingTotal?.usedPercent).toBeNull();
    const missingUsed = mapVolumes([volume({ total: 1000 })])[0];
    expect(missingUsed?.totalBytes).toBe(1000);
    expect(missingUsed?.usedBytes).toBeNull();
    expect(missingUsed?.freeBytes).toBeNull();
    expect(missingUsed?.usedPercent).toBeNull();
    const oversized = mapVolumes([volume({ total: "9007199254740993", used: "1" })])[0];
    expect(oversized?.totalBytes).toBeNull();
    expect(oversized?.usedBytes).toBe(1);
    expect(oversized?.freeBytes).toBeNull();
    expect(() => validateVolumeUsage(1001, 1000)).toThrow(IntegrationError);
    expect(() => validateVolumeUsage(0, 0)).toThrow(IntegrationError);
    expect(() => validateVolumeUsage(null, 0)).toThrow(IntegrationError);
    expect(() => validateVolumeUsage(500, null)).not.toThrow();
    expect(() => validateVolumeUsage(null, 1000)).not.toThrow();
    expect(() => validateVolumeUsage(1000, 1000)).not.toThrow();
    expect(() => mapVolumes([volume({ total: -1, used: 0 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: 1000, used: -1 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: "-1", used: 0 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: 1000, used: "-1000" })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: "-1e3", used: 0 })])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume({ total: "-0", used: 0 })])).toThrow(IntegrationError);
    expect(() =>
      mapVolumes([{ id: "volume_1", status: "normal", size: { total: 1000, used: -1 } }]),
    ).toThrow(IntegrationError);
    expect(() => rejectNegativeByteValue(-1, "DSM volume total is invalid")).toThrow(
      IntegrationError,
    );
    expect(() => rejectNegativeByteValue("-1.5", "DSM volume used size is invalid")).toThrow(
      IntegrationError,
    );
    expect(() => rejectNegativeByteValue(1000, "DSM volume total is invalid")).not.toThrow();
    expect(() => rejectNegativeByteValue("missing", "DSM volume total is invalid")).not.toThrow();
  });

  it("rejects present nonpositive disk capacities and keeps missing or oversized sizes nullable", () => {
    expect(mapDisks([{ id: "sata1", size_total: 1 }])[0]?.sizeBytes).toBe(1);
    expect(mapDisks([{ id: "sata1", size_total: 1000 }])[0]?.sizeBytes).toBe(1000);
    expect(mapDisks([{ id: "sata1", size_total: "1000" }])[0]?.sizeBytes).toBe(1000);
    expect(mapDisks([{ id: "sata1" }])[0]?.sizeBytes).toBeNull();
    expect(mapDisks([{ id: "sata1", size_total: "9007199254740993" }])[0]?.sizeBytes).toBeNull();
    expect(mapDisks([{ id: "sata1", size_total: 1000, size: -1 }])[0]?.sizeBytes).toBe(1000);
    expect(() => mapDisks([{ id: "sata1", size: -1 }])).toThrow(IntegrationError);
    for (const disk of [
      { id: "sata1", size_total: 0 },
      { id: "sata1", size_total: -1 },
      { id: "sata1", size_total: "0" },
      { id: "sata1", size_total: "-0" },
      { id: "sata1", size_total: "-1" },
      { id: "sata1", size_total: "-1e3" },
      { id: "sata1", size: -500 },
      { id: "sata1", total_size: "-500" },
    ]) {
      expect(() => mapDisks([disk])).toThrow(IntegrationError);
    }
    expect(() => rejectNonPositiveByteValue(0, "DSM disk capacity is invalid")).toThrow(
      IntegrationError,
    );
    expect(() => rejectNonPositiveByteValue(-0, "DSM disk capacity is invalid")).toThrow(
      IntegrationError,
    );
    expect(() => rejectNonPositiveByteValue(null, "DSM disk capacity is invalid")).not.toThrow();
    expect(() =>
      rejectNonPositiveByteValue(undefined, "DSM disk capacity is invalid"),
    ).not.toThrow();
    expect(() => rejectNonPositiveByteValue(1000, "DSM disk capacity is invalid")).not.toThrow();
    expect(() =>
      rejectNonPositiveByteValue("9007199254740993", "DSM disk capacity is invalid"),
    ).not.toThrow();
  });

  it("redacts account tokens without matching ordinary substrings", () => {
    expect(redactAccountText("vesty", "vesty")).toBe("[REDACTED]");
    expect(redactAccountText("NAS-vesty-prod", "vesty")).toBe("NAS-[REDACTED]-prod");
    expect(redactAccountText("user:vesty", "vesty")).toBe("user:[REDACTED]");
    expect(redactAccountText("Seagate", "a")).toBe("Seagate");
    expect(redactAccountText("data", "a")).toBe("data");
    expect(redactAccountText("sata1", "a")).toBe("sata1");
    expect(redactAccountText("0", "0")).toBe("[REDACTED]");
    expect(redactAccountText("NAS-0-prod", "0")).toBe("NAS-[REDACTED]-prod");
    expect(redactAccountText("DS920+", "0")).toBe("DS920+");
    expect(redactAccountText("volume10", "0")).toBe("volume10");
    expect(redactAccountText(null, "vesty")).toBeNull();
  });

  it("projects account-safe system text without touching numeric fields", () => {
    const projected = projectAccountSafeSystem(
      {
        model: "NAS-vesty-prod",
        dsmVersion: "DSM-vesty",
        uptimeSeconds: 0,
        systemTemperatureC: 40,
        temperatureWarning: false,
        ramTotalBytes: 1024,
        cpuCores: 4,
        cpuFamily: "vesty",
        cpuSeries: "Series-vesty",
      },
      "vesty",
    );
    expect(projected).toMatchObject({
      model: "NAS-[REDACTED]-prod",
      dsmVersion: "DSM-[REDACTED]",
      uptimeSeconds: 0,
      systemTemperatureC: 40,
      temperatureWarning: false,
      ramTotalBytes: 1024,
      cpuCores: 4,
      cpuFamily: "[REDACTED]",
      cpuSeries: "Series-[REDACTED]",
    });
  });

  it("rejects colliding normalized volume and disk identifiers", () => {
    const volume = (id: string) => ({
      id,
      status: "normal",
      size: { total: 1000, used: 100 },
    });
    expect(() => mapVolumes([volume("data/1"), volume("data?1")])).toThrow(IntegrationError);
    expect(() => mapVolumes([volume("sata1"), volume("sata1")])).toThrow(IntegrationError);
    expect(mapVolumes([volume("data/1"), volume("data/2")]).map((entry) => entry.id)).toEqual([
      "data_1",
      "data_2",
    ]);
    expect(() =>
      mapDisks([
        { id: "disk/1", size_total: 1000 },
        { id: "disk?1", size_total: 1000 },
      ]),
    ).toThrow(IntegrationError);
    const prefix = "x".repeat(64);
    expect(() => mapVolumes([volume(`${prefix}A`), volume(`${prefix}B`)])).toThrow(
      IntegrationError,
    );
    expect(mapVolumes([volume("data_1")])).toHaveLength(1);
    expect(mapDisks([{ id: "data_1", size_total: 1000 }])).toHaveLength(1);
  });

  it("rejects account-projected storage id collisions", () => {
    const volumes = mapVolumes([
      { id: "vesty", status: "normal", size: { total: 1000, used: 1 } },
      { id: "_redacted_", status: "normal", size: { total: 1000, used: 1 } },
    ]);
    expect(() => projectAccountSafeVolumes(volumes, "vesty")).toThrow(IntegrationError);
    const disks = mapDisks([
      { id: "vesty", size_total: 1000 },
      { id: "_redacted_", size_total: 1000 },
    ]);
    expect(() => projectAccountSafeDisks(disks, "vesty")).toThrow(IntegrationError);
    expect(projectAccountSafeDisks([{ ...disks[0]! }], "vesty")[0]?.id).toBe("_redacted_");
  });

  it("preserves semantic telemetry while redacting identity fields", () => {
    const volumes = mapVolumes([
      {
        id: "volume-vesty",
        vol_desc: "backup-vesty",
        filesystem: "ext4",
        raid_type: "shr",
        status: "normal",
        size: { total: 1000, used: 100 },
      },
    ]);
    const normalVolumes = projectAccountSafeVolumes(volumes, "normal");
    expect(normalVolumes[0]).toMatchObject({
      status: "normal",
      filesystem: "ext4",
      raidType: "shr",
    });
    expect(storageLooksDegraded(normalVolumes, [])).toBe(false);

    const warningVolumes = projectAccountSafeVolumes(
      mapVolumes([
        {
          id: "volume_1",
          status: "warning",
          size: { total: 1000, used: 100 },
        },
      ]),
      "warning",
    );
    expect(warningVolumes[0]?.status).toBe("warning");
    expect(storageLooksDegraded(warningVolumes, [])).toBe(true);

    const ext4Volumes = projectAccountSafeVolumes(
      mapVolumes([
        {
          id: "volume_1",
          filesystem: "ext4",
          status: "normal",
          size: { total: 1000, used: 100 },
        },
      ]),
      "ext4",
    );
    expect(ext4Volumes[0]?.filesystem).toBe("ext4");

    const shrVolumes = projectAccountSafeVolumes(
      mapVolumes([
        {
          id: "volume_1",
          raid_type: "shr",
          status: "normal",
          size: { total: 1000, used: 100 },
        },
      ]),
      "shr",
    );
    expect(shrVolumes[0]?.raidType).toBe("shr");

    const identityVolumes = projectAccountSafeVolumes(volumes, "vesty");
    expect(JSON.stringify(identityVolumes)).not.toContain("vesty");
    expect(identityVolumes[0]?.name).toBe("backup-[REDACTED]");
    expect(identityVolumes[0]?.id).toBe("volume-_redacted_");

    const disks = mapDisks([
      {
        id: "disk-vesty",
        name: "Drive-vesty",
        vendor: "vendor-vesty",
        model: "normal",
        type: "ssd",
        status: "normal",
        smart_status: "normal",
        size_total: 1000,
      },
    ]);
    const normalDisks = projectAccountSafeDisks(disks, "normal");
    expect(normalDisks[0]).toMatchObject({
      model: "[REDACTED]",
      status: "normal",
      smartStatus: "normal",
      type: "ssd",
    });
    expect(storageLooksDegraded([], normalDisks)).toBe(false);

    const criticalDisks = projectAccountSafeDisks(
      mapDisks([
        {
          id: "sata1",
          type: "ssd",
          status: "critical",
          smart_status: "critical",
          size_total: 1000,
        },
      ]),
      "critical",
    );
    expect(criticalDisks[0]).toMatchObject({
      status: "critical",
      smartStatus: "critical",
      type: "ssd",
    });
    expect(storageLooksDegraded([], criticalDisks)).toBe(true);

    const ssdDisks = projectAccountSafeDisks(
      mapDisks([{ id: "sata1", type: "ssd", status: "normal", size_total: 1000 }]),
      "ssd",
    );
    expect(ssdDisks[0]?.type).toBe("ssd");

    const identityDisks = projectAccountSafeDisks(disks, "vesty");
    expect(JSON.stringify(identityDisks)).not.toContain("vesty");
    expect(identityDisks[0]).toMatchObject({
      id: "disk-_redacted_",
      displayName: "Drive-[REDACTED]",
      vendor: "vendor-[REDACTED]",
      status: "normal",
      smartStatus: "normal",
      type: "ssd",
    });

    const degradedSmart = projectAccountSafeDisks(
      mapDisks([
        {
          id: "sata1",
          status: "normal",
          smart_status: "degraded",
          size_total: 1000,
        },
      ]),
      "degraded",
    );
    expect(degradedSmart[0]?.smartStatus).toBe("degraded");
    expect(storageLooksDegraded([], degradedSmart)).toBe(true);
  });
});
