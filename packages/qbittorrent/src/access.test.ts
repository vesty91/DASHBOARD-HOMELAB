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
});
