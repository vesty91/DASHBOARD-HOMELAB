import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertBeszelAccess, beszelPermissionsView } from "./access";

describe("beszel access", () => {
  it("requires integration.use and beszel.read together", () => {
    expect(
      beszelPermissionsView({
        userId: "u1",
        subject: { status: "active", isSystemAdmin: false, directPermissions: ["beszel.read"] },
      }).canRead,
    ).toBe(false);
    expect(
      beszelPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "beszel.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      beszelPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertBeszelAccess(
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
