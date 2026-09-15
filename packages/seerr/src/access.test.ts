import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertSeerrAccess, seerrPermissionsView } from "./access";

describe("seerr access", () => {
  it("requires integration.use and seerr.read together", () => {
    expect(
      seerrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["seerr.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      seerrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "seerr.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      seerrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertSeerrAccess(
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

  it("requires interact plus seerr.request.manage", () => {
    expect(
      seerrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.manage"],
        },
      }).canManageRequests,
    ).toBe(false);
    expect(
      seerrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.interact", "seerr.request.manage"],
        },
      }).canManageRequests,
    ).toBe(true);
  });
});
