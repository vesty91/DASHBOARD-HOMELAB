import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertQbittorrentAccess, qbittorrentPermissionsView } from "./access";

describe("qbittorrent access", () => {
  it("requires integration.use and qbittorrent.read together", () => {
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["qbittorrent.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "qbittorrent.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertQbittorrentAccess(
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

  it("requires interact plus the specialized pause or resume permission", () => {
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }),
    ).toEqual({ canRead: false, canManage: true, canPause: false, canResume: false });
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "qbittorrent.pause"],
        },
      }).canPause,
    ).toBe(false);
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "qbittorrent.pause"],
        },
      }).canPause,
    ).toBe(true);
    expect(
      qbittorrentPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "qbittorrent.resume"],
        },
      }).canResume,
    ).toBe(true);
    expect(() =>
      assertQbittorrentAccess(
        {
          userId: "u1",
          subject: {
            status: "active",
            isSystemAdmin: false,
            directPermissions: ["integration.interact", "qbittorrent.read"],
          },
        },
        "pause",
      ),
    ).toThrow(/Permission denied/);
  });
});
