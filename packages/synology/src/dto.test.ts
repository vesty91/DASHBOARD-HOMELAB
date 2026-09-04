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
  validateCpuLoads,
  validateMemoryTotals,
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
    expect(parseUptimeSeconds("1:02:03")).toBe(3723);
    expect(parseUptimeSeconds(90)).toBe(90);
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
});
