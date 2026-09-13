import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertPrometheusAccess, prometheusPermissionsView } from "./access";

describe("prometheus access", () => {
  it("requires integration.use and prometheus.read together", () => {
    expect(
      prometheusPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["prometheus.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      prometheusPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "prometheus.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      prometheusPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertPrometheusAccess(
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
