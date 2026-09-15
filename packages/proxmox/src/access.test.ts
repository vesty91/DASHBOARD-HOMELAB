import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertProxmoxAccess, proxmoxPermissionsView } from "./access";

describe("proxmox access", () => {
  it("requires integration.use and proxmox.read together", () => {
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["proxmox.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "proxmox.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertProxmoxAccess(
        {
          userId: "u1",
          subject: {
            status: "active",
            isSystemAdmin: false,
            directPermissions: ["integration.use"],
          },
        },
        "read",
      ),
    ).toThrow(/Permission denied/);
  });

  it("requires interact plus a specialized Proxmox action permission", () => {
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }),
    ).toMatchObject({
      canStart: false,
      canShutdown: false,
      canReboot: false,
    });
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "proxmox.read", "proxmox.start"],
        },
      }).canStart,
    ).toBe(false);
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "proxmox.start"],
        },
      }).canStart,
    ).toBe(true);
    expect(
      proxmoxPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "proxmox.start"],
        },
      }).canShutdown,
    ).toBe(false);
    expect(() =>
      assertProxmoxAccess(
        {
          userId: "u1",
          subject: {
            status: "active",
            isSystemAdmin: false,
            directPermissions: ["integration.interact", "proxmox.start"],
          },
        },
        "reboot",
      ),
    ).toThrow(/Permission denied/);
  });
});
