import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  requirePermission,
  resolvePermissions,
} from "./index";
const active = { status: "active" as const, isSystemAdmin: false };
describe("permission resolver", () => {
  it("denies by default", () => {
    expect(resolvePermissions(active).size).toBe(0);
    expect(() => requirePermission(active, "user.manage")).toThrow("Permission denied");
  });
  it("unions direct and group roles", () => {
    const subject = {
      ...active,
      directPermissions: ["user.read"],
      groupPermissions: ["group.read"],
    };
    expect(hasPermission(subject, "user.read")).toBe(true);
    expect(hasPermission(subject, "group.read")).toBe(true);
    expect(hasPermission(subject, "settings.manage")).toBe(false);
  });
  it("denies disabled users", () => {
    expect(
      hasPermission(
        { status: "disabled", isSystemAdmin: false, directPermissions: ["user.manage"] },
        "user.manage",
      ),
    ).toBe(false);
  });
  it("does not grant Docker or Synology permissions to the default ADMIN role", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("docker.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("synology.read");
  });
  it("grants active system admins the catalog", () => {
    expect(hasPermission({ ...active, isSystemAdmin: true }, "backup.manage")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "synology.read")).toBe(true);
    expect(hasPermission({ status: "disabled", isSystemAdmin: true }, "backup.manage")).toBe(false);
  });
});
