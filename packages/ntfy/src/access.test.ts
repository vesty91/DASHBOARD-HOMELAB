import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertNtfyAccess, ntfyPermissionsView } from "./access";

describe("ntfy access", () => {
  it("requires integration.use and ntfy.read together", () => {
    expect(
      ntfyPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["ntfy.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      ntfyPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "ntfy.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      ntfyPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertNtfyAccess(
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

  it("requires interact plus ntfy.publish", () => {
    expect(
      ntfyPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }).canPublish,
    ).toBe(false);
    expect(
      ntfyPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "ntfy.publish"],
        },
      }).canPublish,
    ).toBe(true);
  });
});
