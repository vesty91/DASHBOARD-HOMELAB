import { describe, expect, it } from "vitest";
import { sonarrConfigSchema } from "./schemas";
import { SONARR_INTEGRATION_ID, sonarrIntegrationDefinition } from "./definition";

describe("sonarr definition", () => {
  it("is a read-only status adapter with a required API key", () => {
    expect(sonarrIntegrationDefinition.id).toBe(SONARR_INTEGRATION_ID);
    expect(sonarrIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(sonarrIntegrationDefinition.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(sonarrIntegrationDefinition.secretFields[0]?.required).toBe(true);
    expect(
      sonarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
