import { describe, expect, it } from "vitest";
import { assertJellyfinAccess, jellyfinPermissionsView } from "./access";

describe("jellyfin access", () => {
  it("requires an active actor with integration.use and jellyfin.read", () => {
    expect(
      jellyfinPermissionsView({
        userId: "u1",
        subject: { status: "active", isSystemAdmin: false, directPermissions: ["jellyfin.read"] },
      }).canRead,
    ).toBe(false);
    expect(
      jellyfinPermissionsView({
        userId: "u1",
        subject: {
          status: "active",
          isSystemAdmin: false,
          directPermissions: ["integration.use", "jellyfin.read"],
        },
      }).canRead,
    ).toBe(true);
    expect(() =>
      assertJellyfinAccess(
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
    ).toThrow("Permission denied");
  });
});
