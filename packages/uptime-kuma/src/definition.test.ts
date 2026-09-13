import { describe, expect, it } from "vitest";
import { uptimeKumaConfigSchema } from "./schemas";
import { UPTIME_KUMA_INTEGRATION_ID, uptimeKumaIntegrationDefinition } from "./definition";

describe("uptime-kuma definition", () => {
  it("is a read-only /metrics adapter", () => {
    expect(uptimeKumaIntegrationDefinition.id).toBe(UPTIME_KUMA_INTEGRATION_ID);
    expect(uptimeKumaIntegrationDefinition.capabilities).toEqual(["monitors.read"]);
    expect(uptimeKumaIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "apiKey",
    ]);
    expect(uptimeKumaIntegrationDefinition.secretFields[0]?.label).toBe("Clé API Uptime Kuma");
    expect(
      uptimeKumaConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
