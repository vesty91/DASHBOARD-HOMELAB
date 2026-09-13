import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertUptimeKumaAccess, uptimeKumaPermissionsView } from "./access";

describe("uptime-kuma access", () => {
  it("requires integration.use and uptime-kuma.read together", () => {
    expect(
      uptimeKumaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["uptime-kuma.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      uptimeKumaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "uptime-kuma.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      uptimeKumaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertUptimeKumaAccess(
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
