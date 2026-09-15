import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertCustomApiAccess, customApiPermissionsView } from "./access";

describe("custom-api access", () => {
  it("requires integration.use and custom-api.read together", () => {
    expect(
      customApiPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["custom-api.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      customApiPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "custom-api.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      customApiPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(
      customApiPermissionsView({
        userId: "u1",
        subject: { status: "active", isSystemAdmin: true },
      }).canRead,
    ).toBe(true);
    expect(() =>
      assertCustomApiAccess(
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
