import { describe, expect, it } from "vitest";
import { groupPermissionGrantsInputSchema } from "./group-permission-grants";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";

describe("group permission grants input", () => {
  it("accepts known permissions and rejects unknown ones", () => {
    expect(
      groupPermissionGrantsInputSchema.parse({
        groupId: GROUP_ID,
        permissions: ["synology.read", "integration.use", "synology.read"],
      }).permissions,
    ).toEqual(["synology.read", "integration.use"]);
    expect(() =>
      groupPermissionGrantsInputSchema.parse({
        groupId: GROUP_ID,
        permissions: ["not.a.permission"],
      }),
    ).toThrow();
  });
});
