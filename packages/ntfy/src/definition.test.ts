import { describe, expect, it } from "vitest";
import { ntfyConfigSchema } from "./schemas";
import { NTFY_INTEGRATION_ID, ntfyIntegrationDefinition } from "./definition";

describe("ntfy definition", () => {
  it("is a read-only status adapter with an optional token", () => {
    expect(ntfyIntegrationDefinition.id).toBe(NTFY_INTEGRATION_ID);
    expect(ntfyIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(ntfyIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "accessToken",
    ]);
    expect(ntfyIntegrationDefinition.secretFields[0]?.required).toBe(false);
    expect(
      ntfyConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
