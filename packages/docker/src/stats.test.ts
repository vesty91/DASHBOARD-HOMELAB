import { describe, expect, it } from "vitest";
import {
  computeBlockIo,
  computeCpuPercent,
  computeMemory,
  computeNetwork,
  mapContainerStats,
} from "./stats";

describe("Docker stats math", () => {
  it("computes CPU from deltas and returns null when unknown", () => {
    expect(
      computeCpuPercent({
        cpu_stats: {
          cpu_usage: { total_usage: 200, percpu_usage: [1] },
          system_cpu_usage: 400,
          online_cpus: 1,
        },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 },
      }),
    ).toBe(50);
    expect(
      computeCpuPercent({
        cpu_stats: {
          cpu_usage: { total_usage: 400, percpu_usage: [1, 1] },
          system_cpu_usage: 800,
          online_cpus: 2,
        },
        precpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 400 },
      }),
    ).toBe(100);
    expect(
      computeCpuPercent({
        cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200, online_cpus: 1 },
        precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 },
      }),
    ).toBeNull();
    expect(computeCpuPercent({ cpu_stats: { cpu_usage: { total_usage: 10 } } })).toBeNull();
  });

  it("uses a documented working-set memory convention", () => {
    expect(
      computeMemory({
        memory_stats: { usage: 120, limit: 200, stats: { cache: 20 } },
      }),
    ).toEqual({ usage: 100, limit: 200, percent: 50 });
    expect(
      computeMemory({
        memory_stats: { usage: 80, limit: 200, stats: { inactive_file: 30 } },
      }),
    ).toEqual({ usage: 50, limit: 200, percent: 25 });
    expect(computeMemory({ memory_stats: { usage: 80 } })).toEqual({
      usage: 80,
      limit: null,
      percent: null,
    });
    expect(computeMemory({ memory_stats: { usage: 80, limit: 0 } }).percent).toBeNull();
  });

  it("sums network and block IO safely", () => {
    expect(
      computeNetwork({
        networks: { eth0: { rx_bytes: 10, tx_bytes: 4 }, eth1: { rx_bytes: 5, tx_bytes: 6 } },
      }),
    ).toEqual({ rx: 15, tx: 10 });
    expect(computeNetwork({})).toEqual({ rx: null, tx: null });
    expect(
      computeBlockIo({
        blkio_stats: {
          io_service_bytes_recursive: [
            { op: "Read", value: 8 },
            { op: "write", value: 2 },
          ],
        },
      }),
    ).toEqual({ read: 8, write: 2 });
    expect(computeBlockIo({})).toEqual({ read: null, write: null });
    const mapped = mapContainerStats({});
    expect(Object.values(mapped).every((value) => value === null || Number.isFinite(value))).toBe(
      true,
    );
    expect(mapped.cpuPercent).toBeNull();
  });
});
