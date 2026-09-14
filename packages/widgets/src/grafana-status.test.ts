import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  GRAFANA_STATUS_UNSET_INTEGRATION_ID,
  grafanaStatusConfigSchema,
  grafanaStatusContract,
} from "./grafana-status";

describe("grafana-status widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(grafanaStatusContract.publicSafe).toBe(false);
    expect(grafanaStatusContract.id).toBe("grafana-status");
    assertWidgetContract(grafanaStatusContract);
    expect(grafanaStatusConfigSchema.parse(grafanaStatusContract.defaultConfig)).toEqual({
      integrationId: GRAFANA_STATUS_UNSET_INTEGRATION_ID,
    });
  });
});
