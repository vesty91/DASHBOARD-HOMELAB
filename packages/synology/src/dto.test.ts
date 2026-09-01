import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  kibToBytes,
  mapDisks,
  mapResources,
  mapSystemInfo,
  mapVolumes,
  mbToBytes,
  parseSafeIntegerBytes,
  parseUptimeSeconds,
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
    const inconsistent = mapResources({
      cpu: { user_load: 90, system_load: 20, other_load: 5 },
      memory: {},
    });
    expect(inconsistent.cpuTotalPercent).toBeNull();
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
    expect(mapDisks([{ temp: 200 }])[0]?.temperatureC).toBeNull();
  });

  it("rejects oversized storage inventories", () => {
    expect(() =>
      mapVolumes(Array.from({ length: 257 }, (_, index) => ({ id: `v${index}` }))),
    ).toThrow(IntegrationError);
    expect(() => mapDisks(Array.from({ length: 65 }, (_, index) => ({ id: `d${index}` })))).toThrow(
      IntegrationError,
    );
  });
});
