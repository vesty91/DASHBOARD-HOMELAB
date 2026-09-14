import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  RADARR_OVERVIEW_UNSET_INTEGRATION_ID,
  radarrOverviewConfigSchema,
  radarrOverviewContract,
} from "./radarr-overview";

describe("radarr-overview widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(radarrOverviewContract.publicSafe).toBe(false);
    expect(radarrOverviewContract.id).toBe("radarr-overview");
    assertWidgetContract(radarrOverviewContract);
    expect(radarrOverviewConfigSchema.parse(radarrOverviewContract.defaultConfig)).toEqual({
      integrationId: RADARR_OVERVIEW_UNSET_INTEGRATION_ID,
    });
  });
});
