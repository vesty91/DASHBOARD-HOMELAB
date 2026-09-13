import { describe, expect, it } from "vitest";
import { prometheusConfigSchema } from "./schemas";
import { PROMETHEUS_INTEGRATION_ID, prometheusIntegrationDefinition } from "./definition";

describe("prometheus definition", () => {
  it("is a read-only official HTTP API adapter", () => {
    expect(prometheusIntegrationDefinition.id).toBe(PROMETHEUS_INTEGRATION_ID);
    expect(prometheusIntegrationDefinition.capabilities).toEqual(["query.read"]);
    expect(prometheusIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "bearerToken",
    ]);
    expect(prometheusIntegrationDefinition.secretFields[0]?.required).toBe(false);
    expect(prometheusIntegrationDefinition.secretFields[0]?.label).toBe(
      "Jeton Bearer Prometheus (optionnel)",
    );
    expect(
      prometheusConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
