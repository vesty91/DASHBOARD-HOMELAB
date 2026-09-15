import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  PROXMOX_RESOURCES_MAX,
  mapClusterResources,
  mapClusterStatus,
  mapGuestPowerStatus,
  mapVersion,
  parseJsonValue,
} from "./dto";

const TOKEN = "root@pam!dashboard=secret-token";

describe("proxmox dto", () => {
  it("maps version and redacts secrets", () => {
    expect(
      mapVersion({ data: { version: "8.2.4", release: "8.2", repoid: TOKEN } }, [TOKEN]),
    ).toEqual({ version: "8.2.4", release: "8.2" });
  });

  it("maps cluster status without node IPs", () => {
    const mapped = mapClusterStatus({
      data: [
        { type: "cluster", name: "homelab", quorate: 1 },
        { type: "node", name: "pve1", online: 1, ip: "192.168.1.10" },
        { type: "node", name: "pve2", online: 0, ip: "192.168.1.11" },
      ],
    });
    expect(mapped).toEqual({
      name: "homelab",
      quorate: true,
      nodeCount: 2,
      onlineNodeCount: 1,
    });
    expect(JSON.stringify(mapped)).not.toContain("192.168");
  });

  it("counts guests without exposing names and truncates nodes", () => {
    const mapped = mapClusterResources({
      data: [
        {
          type: "node",
          node: "pve1",
          status: "online",
          cpu: 0.25,
          mem: 4_000_000_000,
          maxmem: 16_000_000_000,
          uptime: 3600,
        },
        { type: "qemu", vmid: 100, name: "secret-vm", status: "running" },
        { type: "qemu", vmid: 101, name: "other", status: "stopped" },
        { type: "lxc", vmid: 200, name: "ct-private", status: "running" },
        { type: "storage", storage: "local", disk: 10, maxdisk: 100 },
      ],
    });
    expect(mapped.guests).toEqual({ vmCount: 2, vmRunning: 1, lxcCount: 1, lxcRunning: 1 });
    expect(mapped.nodes.nodes[0]?.name).toBe("pve1");
    expect(mapped.storage).toEqual({ storageCount: 1, usedBytes: 10, totalBytes: 100 });
    expect(JSON.stringify(mapped)).not.toContain("secret-vm");
    expect(JSON.stringify(mapped)).not.toContain("ct-private");
  });

  it("rejects oversized resource arrays and invalid JSON", () => {
    expect(() =>
      mapClusterResources({
        data: Array.from({ length: PROXMOX_RESOURCES_MAX + 1 }, () => ({ type: "qemu" })),
      }),
    ).toThrow(IntegrationError);
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });

  it("maps guest power status without exposing guest names", () => {
    expect(mapGuestPowerStatus({ data: { status: "running", name: "secret-vm", vmid: 100 } })).toBe(
      "running",
    );
    expect(mapGuestPowerStatus({ data: { status: "stopped" } })).toBe("stopped");
    expect(mapGuestPowerStatus({ data: { status: "paused" } })).toBe("unknown");
    const mapped = mapGuestPowerStatus({
      data: { status: "running", name: "secret-vm" },
    });
    expect(JSON.stringify(mapped)).not.toContain("secret-vm");
  });
});
