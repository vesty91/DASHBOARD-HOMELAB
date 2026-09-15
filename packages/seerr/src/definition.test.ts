import { describe, expect, it } from "vitest";
import { seerrConfigSchema } from "./schemas";
import { SEERR_INTEGRATION_ID, seerrIntegrationDefinition } from "./definition";

describe("seerr definition", () => {
  it("is a read-only status adapter with a required API key", () => {
    expect(seerrIntegrationDefinition.id).toBe(SEERR_INTEGRATION_ID);
    expect(seerrIntegrationDefinition.id).toBe("seerr");
    expect(seerrIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(seerrIntegrationDefinition.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(seerrIntegrationDefinition.secretFields[0]?.required).toBe(true);
    expect(
      seerrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
