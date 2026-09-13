import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertImmichAccess, immichPermissionsView } from "./access";

describe("immich access", () => {
  it("requires an active actor with integration.use and immich.read", () => {
    expect(
      immichPermissionsView({
        userId: "u1",
        subject: { status: "active", isSystemAdmin: false, directPermissions: ["immich.read"] },
      }).canRead,
    ).toBe(false);
    expect(
      immichPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "immich.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(() =>
      assertImmichAccess(
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
    expect(
      immichPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
  });
});
