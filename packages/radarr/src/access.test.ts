import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertRadarrAccess, radarrPermissionsView } from "./access";

describe("radarr access", () => {
  it("requires integration.use and radarr.read together", () => {
    expect(
      radarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["radarr.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      radarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "radarr.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      radarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertRadarrAccess(
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

  it("requires interact plus radarr.command", () => {
    expect(
      radarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }).canCommand,
    ).toBe(false);
    expect(
      radarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "radarr.command"],
        },
      }).canCommand,
    ).toBe(true);
  });
});
