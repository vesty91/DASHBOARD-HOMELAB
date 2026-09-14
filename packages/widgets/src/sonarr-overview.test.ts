import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  SONARR_OVERVIEW_UNSET_INTEGRATION_ID,
  sonarrOverviewConfigSchema,
  sonarrOverviewContract,
} from "./sonarr-overview";

describe("sonarr-overview widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(sonarrOverviewContract.publicSafe).toBe(false);
    expect(sonarrOverviewContract.id).toBe("sonarr-overview");
    assertWidgetContract(sonarrOverviewContract);
    expect(sonarrOverviewConfigSchema.parse(sonarrOverviewContract.defaultConfig)).toEqual({
      integrationId: SONARR_OVERVIEW_UNSET_INTEGRATION_ID,
    });
  });
});
