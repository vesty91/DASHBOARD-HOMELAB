import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertProwlarrAccess, prowlarrPermissionsView } from "./access";

describe("prowlarr access", () => {
  it("requires integration.use and prowlarr.read together", () => {
    expect(
      prowlarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["prowlarr.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      prowlarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "prowlarr.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      prowlarrPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertProwlarrAccess(
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
