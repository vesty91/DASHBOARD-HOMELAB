import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertSonarrAccess, sonarrPermissionsView } from "./access";

describe("sonarr access", () => {
  it("requires integration.use and sonarr.read together", () => {
    expect(
      sonarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["sonarr.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      sonarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "sonarr.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      sonarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertSonarrAccess(
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

  it("requires interact plus sonarr.command", () => {
    expect(
      sonarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }).canCommand,
    ).toBe(false);
    expect(
      sonarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "sonarr.command"],
        },
      }).canCommand,
    ).toBe(true);
  });
});
