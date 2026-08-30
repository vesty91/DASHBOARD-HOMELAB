import { describe, expect, it } from "vitest";
import {
  computeUptimeSeconds,
  mapInspectPorts,
  mapListPorts,
  normalizeContainerState,
  normalizeHealthStatus,
} from "./dto";
import { mapContainerStats } from "./stats";
import { recognizeDockerImage } from "./recognition";

const SECRET_FIXTURE = {
  Id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  Names: ["/jellyfin"],
  Image: "jellyfin/jellyfin:10",
  Created: 1_700_000_000,
  State: "running",
  Status: "Up 2 hours",
  Ports: [{ PrivatePort: 8096, PublicPort: 8096, Type: "tcp", IP: "0.0.0.0" }],
  Env: ["PASSWORD=SECRET"],
  Labels: { token: "SECRET" },
  Mounts: [{ Source: "/secret" }],
  Command: "evil",
  HostConfig: { Privileged: true },
};

describe("Docker DTO mapping", () => {
  it("normalizes states and health without inventing running or healthy", () => {
    expect(normalizeContainerState("running")).toBe("running");
    expect(normalizeContainerState("weird")).toBe("unknown");
    expect(normalizeContainerState(undefined)).toBe("unknown");
    expect(normalizeHealthStatus("healthy", true)).toBe("healthy");
    expect(normalizeHealthStatus("unhealthy", true)).toBe("unhealthy");
    expect(normalizeHealthStatus("starting", true)).toBe("starting");
    expect(normalizeHealthStatus(undefined, false)).toBe("none");
    expect(normalizeHealthStatus("degraded", true)).toBe("unknown");
  });

  it("computes uptime only for running containers with a valid start", () => {
    const started = new Date(Date.now() - 90_000).toISOString();
    expect(computeUptimeSeconds("running", started)).toBeGreaterThanOrEqual(89);
    expect(computeUptimeSeconds("exited", started)).toBeNull();
    expect(computeUptimeSeconds("running", null)).toBeNull();
    expect(computeUptimeSeconds("running", "not-a-date")).toBeNull();
  });

  it("maps ports without raw network settings", () => {
    expect(mapListPorts(SECRET_FIXTURE.Ports)).toEqual([
      { privatePort: 8096, publicPort: 8096, protocol: "tcp", hostIp: "0.0.0.0" },
    ]);
    expect(
      mapInspectPorts({
        Ports: { "8096/tcp": [{ HostIp: "127.0.0.1", HostPort: "8096" }] },
      }),
    ).toEqual([{ privatePort: 8096, publicPort: 8096, protocol: "tcp", hostIp: "127.0.0.1" }]);
  });

  it("never serializes secret container fields in mapped stats or recognition", () => {
    const stats = mapContainerStats({
      Env: ["PASSWORD=SECRET"],
      Labels: { token: "SECRET" },
      cpu_stats: {
        cpu_usage: { total_usage: 200, percpu_usage: [1, 1] },
        system_cpu_usage: 400,
        online_cpus: 2,
      },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 200 },
    });
    const serialized = JSON.stringify({
      fixture: SECRET_FIXTURE.Id,
      stats,
      app: recognizeDockerImage("jellyfin/jellyfin"),
    });
    expect(serialized).not.toContain("PASSWORD");
    expect(serialized).not.toMatch(/"Env"/);
    expect(serialized).not.toMatch(/"Labels"/);
    expect(serialized).not.toMatch(/"Mounts"/);
    expect(serialized).not.toMatch(/"HostConfig"/);
    expect(serialized).not.toMatch(/"Command"/);
  });
});
