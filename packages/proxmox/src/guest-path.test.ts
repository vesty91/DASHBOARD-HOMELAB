import { describe, expect, it } from "vitest";
import {
  assertProxmoxNodeName,
  assertProxmoxVmid,
  isProxmoxGuestPowerPath,
  isProxmoxGuestStatusCurrentPath,
  proxmoxGuestPowerPath,
  proxmoxGuestResourceId,
  proxmoxGuestStatusCurrentPath,
} from "./guest-path";

describe("proxmox guest paths", () => {
  it("builds official status and power paths from validated segments", () => {
    expect(proxmoxGuestStatusCurrentPath("pve1", "qemu", 100)).toBe(
      "/api2/json/nodes/pve1/qemu/100/status/current",
    );
    expect(proxmoxGuestPowerPath("pve-2", "lxc", 101, "shutdown")).toBe(
      "/api2/json/nodes/pve-2/lxc/101/status/shutdown",
    );
    expect(proxmoxGuestResourceId("pve1", "qemu", 100)).toBe("pve1-qemu-100");
    expect(isProxmoxGuestStatusCurrentPath("/api2/json/nodes/pve1/qemu/100/status/current")).toBe(
      true,
    );
    expect(isProxmoxGuestPowerPath("/api2/json/nodes/pve1/lxc/101/status/reboot")).toBe(true);
  });

  it("rejects malformed node names, VMIDs, and destructive paths", () => {
    expect(() => assertProxmoxNodeName("../etc")).toThrow(/Invalid Proxmox node/i);
    expect(() => assertProxmoxNodeName("pve/qemu")).toThrow(/Invalid Proxmox node/i);
    expect(() => assertProxmoxVmid(0)).toThrow(/Invalid Proxmox VMID/i);
    expect(() => assertProxmoxVmid(1.5)).toThrow(/Invalid Proxmox VMID/i);
    expect(isProxmoxGuestPowerPath("/api2/json/nodes/pve1/qemu/100/status/stop")).toBe(false);
    expect(isProxmoxGuestPowerPath("/api2/json/nodes/pve1/qemu/100/status/current")).toBe(false);
    expect(isProxmoxGuestStatusCurrentPath("/api2/json/nodes/pve1/qemu/100/status/start")).toBe(
      false,
    );
  });
});
