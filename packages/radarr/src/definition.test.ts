import { describe, expect, it } from "vitest";
import { radarrConfigSchema } from "./schemas";
import { RADARR_INTEGRATION_ID, radarrIntegrationDefinition } from "./definition";

describe("radarr definition", () => {
  it("exposes status read and bounded command capabilities", () => {
    expect(radarrIntegrationDefinition.id).toBe(RADARR_INTEGRATION_ID);
    expect(radarrIntegrationDefinition.capabilities).toEqual(["status.read", "command.queue"]);
    expect(radarrIntegrationDefinition.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(radarrIntegrationDefinition.secretFields[0]?.required).toBe(true);
    expect(
      radarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
