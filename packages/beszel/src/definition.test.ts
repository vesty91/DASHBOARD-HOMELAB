import { describe, expect, it } from "vitest";
import { beszelConfigSchema } from "./schemas";
import { BESZEL_INTEGRATION_ID, beszelIntegrationDefinition } from "./definition";

describe("beszel definition", () => {
  it("is a read-only hosts adapter", () => {
    expect(beszelIntegrationDefinition.id).toBe(BESZEL_INTEGRATION_ID);
    expect(beszelIntegrationDefinition.capabilities).toEqual(["hosts.read"]);
    expect(beszelIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "password",
    ]);
    expect(
      beszelConfigSchema.parse({
        identity: "ops@lab.example",
        verifyTls: true,
        timeoutMs: 8000,
      }).identity,
    ).toBe("ops@lab.example");
  });
});
