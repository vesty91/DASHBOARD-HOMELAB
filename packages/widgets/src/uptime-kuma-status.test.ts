import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID,
  uptimeKumaStatusConfigSchema,
  uptimeKumaStatusContract,
} from "./uptime-kuma-status";

describe("uptime-kuma-status widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(uptimeKumaStatusContract.publicSafe).toBe(false);
    expect(uptimeKumaStatusContract.id).toBe("uptime-kuma-status");
    assertWidgetContract(uptimeKumaStatusContract);
    expect(uptimeKumaStatusConfigSchema.parse(uptimeKumaStatusContract.defaultConfig)).toEqual({
      integrationId: UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID,
    });
  });
});
