import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
  jellyfinSessionsConfigSchema,
  jellyfinSessionsContract,
} from "./jellyfin-sessions";

describe("jellyfin-sessions widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(jellyfinSessionsContract.publicSafe).toBe(false);
    expect(jellyfinSessionsContract.id).toBe("jellyfin-sessions");
    assertWidgetContract(jellyfinSessionsContract);
    expect(jellyfinSessionsConfigSchema.parse(jellyfinSessionsContract.defaultConfig)).toEqual({
      integrationId: JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
    });
  });
});
