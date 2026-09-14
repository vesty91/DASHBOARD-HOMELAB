import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  NTFY_STATUS_UNSET_INTEGRATION_ID,
  ntfyStatusConfigSchema,
  ntfyStatusContract,
} from "./ntfy-status";

describe("ntfy-status widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(ntfyStatusContract.publicSafe).toBe(false);
    expect(ntfyStatusContract.id).toBe("ntfy-status");
    assertWidgetContract(ntfyStatusContract);
    expect(ntfyStatusConfigSchema.parse(ntfyStatusContract.defaultConfig)).toEqual({
      integrationId: NTFY_STATUS_UNSET_INTEGRATION_ID,
    });
  });
});
