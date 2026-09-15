import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  SEERR_REQUESTS_UNSET_INTEGRATION_ID,
  seerrRequestsConfigSchema,
  seerrRequestsContract,
} from "./seerr-requests";

describe("seerr-requests widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(seerrRequestsContract.publicSafe).toBe(false);
    expect(seerrRequestsContract.id).toBe("seerr-requests");
    assertWidgetContract(seerrRequestsContract);
    expect(seerrRequestsConfigSchema.parse(seerrRequestsContract.defaultConfig)).toEqual({
      integrationId: SEERR_REQUESTS_UNSET_INTEGRATION_ID,
    });
  });
});
