import { describe, expect, it } from "vitest";
import { grafanaConfigSchema } from "./schemas";
import { GRAFANA_INTEGRATION_ID, grafanaIntegrationDefinition } from "./definition";

describe("grafana definition", () => {
  it("is a read-only status adapter", () => {
    expect(grafanaIntegrationDefinition.id).toBe(GRAFANA_INTEGRATION_ID);
    expect(grafanaIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(grafanaIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "serviceAccountToken",
    ]);
    expect(grafanaIntegrationDefinition.secretFields[0]?.required).toBe(true);
    expect(
      grafanaConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
