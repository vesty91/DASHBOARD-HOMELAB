import { describe, expect, it } from "vitest";
import { sonarrConfigSchema } from "./schemas";
import { SONARR_INTEGRATION_ID, sonarrIntegrationDefinition } from "./definition";

describe("sonarr definition", () => {
  it("exposes status read and bounded command capabilities", () => {
    expect(sonarrIntegrationDefinition.id).toBe(SONARR_INTEGRATION_ID);
    expect(sonarrIntegrationDefinition.capabilities).toEqual(["status.read", "command.queue"]);
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
