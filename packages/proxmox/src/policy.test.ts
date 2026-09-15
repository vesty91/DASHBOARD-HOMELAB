import { describe, expect, it } from "vitest";
import {
  PROXMOX_CLUSTER_RESOURCES_PATH,
  PROXMOX_CLUSTER_STATUS_PATH,
  PROXMOX_VERSION_PATH,
  assertProxmoxBaseUrl,
  assertProxmoxEndpointAllowed,
} from "./policy";

describe("proxmox policy", () => {
  it("requires an origin-only HTTP(S) URL", () => {
    expect(assertProxmoxBaseUrl("https://pve.lab:8006").origin).toBe("https://pve.lab:8006");
    expect(() => assertProxmoxBaseUrl("https://user:pass@pve.lab:8006")).toThrow(/credentials/i);
    expect(() => assertProxmoxBaseUrl("https://pve.lab:8006/api2/json")).toThrow(/origin/i);
  });

  it("allows only the read-only cluster endpoints", () => {
    assertProxmoxEndpointAllowed("GET", `https://pve.lab:8006${PROXMOX_VERSION_PATH}`);
    assertProxmoxEndpointAllowed("GET", `https://pve.lab:8006${PROXMOX_CLUSTER_STATUS_PATH}`);
    assertProxmoxEndpointAllowed("GET", `https://pve.lab:8006${PROXMOX_CLUSTER_RESOURCES_PATH}`);
    expect(() =>
      assertProxmoxEndpointAllowed("GET", `https://pve.lab:8006${PROXMOX_VERSION_PATH}?token=x`),
    ).toThrow(/query/i);
    expect(() =>
      assertProxmoxEndpointAllowed("POST", `https://pve.lab:8006${PROXMOX_VERSION_PATH}`),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProxmoxEndpointAllowed(
        "GET",
        "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/start",
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProxmoxEndpointAllowed("GET", "https://pve.lab:8006/api2/extjs/cluster/resources"),
    ).toThrow(/allowlist/i);
  });

  it("allows guest status reads and power POSTs on the official paths only", () => {
    assertProxmoxEndpointAllowed(
      "GET",
      "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/current",
    );
    assertProxmoxEndpointAllowed(
      "POST",
      "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/start",
    );
    assertProxmoxEndpointAllowed(
      "POST",
      "https://pve.lab:8006/api2/json/nodes/pve-2/lxc/101/status/shutdown",
    );
    assertProxmoxEndpointAllowed(
      "POST",
      "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/reboot",
    );
    expect(() =>
      assertProxmoxEndpointAllowed(
        "POST",
        "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/stop",
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProxmoxEndpointAllowed(
        "POST",
        "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/destroy",
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProxmoxEndpointAllowed(
        "GET",
        "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/start",
      ),
    ).toThrow(/allowlist/i);
    expect(() =>
      assertProxmoxEndpointAllowed(
        "DELETE",
        "https://pve.lab:8006/api2/json/nodes/pve1/qemu/100/status/start",
      ),
    ).toThrow(/method/i);
    expect(() =>
      assertProxmoxEndpointAllowed(
        "POST",
        "https://pve.lab:8006/api2/json/nodes/../qemu/100/status/start",
      ),
    ).toThrow(/traversal|allowlist|Invalid/i);
  });
});
