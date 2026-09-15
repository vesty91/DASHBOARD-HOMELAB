import { describe, expect, it } from "vitest";
import { prowlarrConfigSchema } from "./schemas";
import { PROWLARR_INTEGRATION_ID, prowlarrIntegrationDefinition } from "./definition";

describe("prowlarr definition", () => {
  it("is a read-only status adapter with a required API key", () => {
    expect(prowlarrIntegrationDefinition.id).toBe(PROWLARR_INTEGRATION_ID);
    expect(prowlarrIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(prowlarrIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "apiKey",
    ]);
    expect(prowlarrIntegrationDefinition.secretFields[0]?.required).toBe(true);
    expect(
      prowlarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
