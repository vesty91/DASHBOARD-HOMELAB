import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROLE_PERMISSIONS,
  canAssignGroupPermissionGrants,
  hasPermission,
  isPermission,
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
  it("does not grant Docker, Synology, Jellyfin, Immich, Beszel, Prometheus, Uptime Kuma, Proxmox, Grafana, ntfy, Sonarr, Radarr, Prowlarr or qBittorrent permissions to the default ADMIN role", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("docker.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("synology.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("jellyfin.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("immich.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("beszel.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("prometheus.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("uptime-kuma.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("proxmox.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("grafana.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("ntfy.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("sonarr.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("radarr.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("prowlarr.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("qbittorrent.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("oidc.manage");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("audit.read");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).not.toContain("session.manage");
  });
  it("grants self-session permissions to every default role", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.VIEWER).toContain("session.read.self");
    expect(DEFAULT_ROLE_PERMISSIONS.VIEWER).toContain("session.revoke.self");
    expect(DEFAULT_ROLE_PERMISSIONS.ADMIN).toContain("session.read.self");
  });
  it("grants active system admins the catalog", () => {
    expect(hasPermission({ ...active, isSystemAdmin: true }, "backup.manage")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "oidc.manage")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "audit.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "session.manage")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "synology.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "grafana.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "ntfy.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "sonarr.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "radarr.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "prowlarr.read")).toBe(true);
    expect(hasPermission({ ...active, isSystemAdmin: true }, "qbittorrent.read")).toBe(true);
    expect(hasPermission({ status: "disabled", isSystemAdmin: true }, "backup.manage")).toBe(false);
  });
  it("reserves extra group permission grants to active system admins", () => {
    expect(isPermission("synology.read")).toBe(true);
    expect(isPermission("not.a.permission")).toBe(false);
    expect(
      canAssignGroupPermissionGrants({
        status: "active",
        isSystemAdmin: false,
        directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
      }),
    ).toBe(false);
    expect(canAssignGroupPermissionGrants({ status: "active", isSystemAdmin: true })).toBe(true);
    expect(canAssignGroupPermissionGrants({ status: "disabled", isSystemAdmin: true })).toBe(false);
  });
});
