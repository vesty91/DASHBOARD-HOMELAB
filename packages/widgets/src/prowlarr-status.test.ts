import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  PROWLARR_STATUS_UNSET_INTEGRATION_ID,
  prowlarrStatusConfigSchema,
  prowlarrStatusContract,
} from "./prowlarr-status";

describe("prowlarr-status widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(prowlarrStatusContract.publicSafe).toBe(false);
    expect(prowlarrStatusContract.id).toBe("prowlarr-status");
    assertWidgetContract(prowlarrStatusContract);
    expect(prowlarrStatusConfigSchema.parse(prowlarrStatusContract.defaultConfig)).toEqual({
      integrationId: PROWLARR_STATUS_UNSET_INTEGRATION_ID,
    });
  });
});
