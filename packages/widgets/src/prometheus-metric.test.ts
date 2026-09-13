import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  PROMETHEUS_METRIC_UNSET_INTEGRATION_ID,
  prometheusMetricConfigSchema,
  prometheusMetricContract,
} from "./prometheus-metric";

describe("prometheus-metric widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(prometheusMetricContract.publicSafe).toBe(false);
    expect(prometheusMetricContract.id).toBe("prometheus-metric");
    assertWidgetContract(prometheusMetricContract);
    expect(prometheusMetricConfigSchema.parse(prometheusMetricContract.defaultConfig)).toEqual({
      integrationId: PROMETHEUS_METRIC_UNSET_INTEGRATION_ID,
      query: "up",
      mode: "instant",
      rangeSeconds: 900,
      stepSeconds: 60,
    });
    expect(() =>
      prometheusMetricConfigSchema.parse({
        ...prometheusMetricContract.defaultConfig,
        query: "up\nrate",
      }),
    ).toThrow();
  });
});
