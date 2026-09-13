import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  IMMICH_STATS_UNSET_INTEGRATION_ID,
  immichStatsConfigSchema,
  immichStatsContract,
} from "./immich-stats";

describe("immich-stats widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(immichStatsContract.publicSafe).toBe(false);
    expect(immichStatsContract.id).toBe("immich-stats");
    assertWidgetContract(immichStatsContract);
    expect(immichStatsConfigSchema.parse(immichStatsContract.defaultConfig)).toEqual({
      integrationId: IMMICH_STATS_UNSET_INTEGRATION_ID,
    });
  });
});
