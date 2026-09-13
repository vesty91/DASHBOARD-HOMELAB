import { describe, expect, it } from "vitest";
import { assembleHostsDto, mapHost, mapHostsPage, parseAuthToken } from "./dto";

const PASSWORD = "BZ-SUPER-SECRET";

describe("beszel dto", () => {
  it("projects a system record without PocketBase metadata", () => {
    const host = mapHost(
      {
        id: "sys1",
        collectionId: "col",
        collectionName: "systems",
        name: "NAS",
        host: "10.0.0.8",
        status: "up",
        updated: "2026-09-13 10:00:00.000Z",
        users: ["u1"],
        info: { cpu: 12.5, mp: 40, dp: 55, bb: 4096, v: "0.12.1", k: "secret-kernel" },
      },
      [PASSWORD],
    );
    expect(host).toEqual({
      id: "sys1",
      name: "NAS",
      host: "10.0.0.8",
      status: "up",
      updatedAt: "2026-09-13 10:00:00.000Z",
      cpuPercent: 12.5,
      memoryPercent: 40,
      diskPercent: 55,
      networkBytes: 4096,
      agentVersion: "0.12.1",
    });
    expect(JSON.stringify(host)).not.toMatch(/collection|users|kernel/i);
  });

  it("leaves network null when bb is absent and redacts secrets", () => {
    const host = mapHost(
      {
        id: "sys1",
        name: PASSWORD,
        status: "down",
        info: { cpu: 1, mp: 2, dp: 3, b: 99 },
      },
      [PASSWORD],
    );
    expect(host.networkBytes).toBeNull();
    expect(host.name).not.toContain(PASSWORD);
  });

  it("rejects a page that does not match the requested pagination", () => {
    expect(() => mapHostsPage({ page: 2, perPage: 50, items: [] }, 1, 50)).toThrow(/inconsistent/);
  });

  it("counts canonical statuses only", () => {
    const dto = assembleHostsDto(
      [
        mapHost({ id: "a", name: "A", status: "up" }),
        mapHost({ id: "b", name: "B", status: "down" }),
        mapHost({ id: "c", name: "C", status: "paused" }),
        mapHost({ id: "d", name: "D", status: "pending" }),
      ],
      false,
    );
    expect(dto).toMatchObject({
      hostCount: 4,
      upCount: 1,
      downCount: 1,
      pausedCount: 1,
      pendingCount: 1,
      truncated: false,
    });
  });

  it("rejects a missing auth token", () => {
    expect(() => parseAuthToken({ record: {} })).toThrow(/auth response/);
  });
});
