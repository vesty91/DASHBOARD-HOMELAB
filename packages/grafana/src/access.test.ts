import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE_PERMISSIONS } from "@dashboard/permissions";
import { assertGrafanaAccess, grafanaPermissionsView } from "./access";

describe("grafana access", () => {
  it("requires integration.use and grafana.read together", () => {
    expect(
      grafanaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["grafana.read"],
        },
      }).canRead,
    ).toBe(false);
    expect(
      grafanaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "grafana.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(
      grafanaPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: DEFAULT_ROLE_PERMISSIONS.ADMIN,
        },
      }).canRead,
    ).toBe(false);
    expect(() =>
      assertGrafanaAccess(
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
