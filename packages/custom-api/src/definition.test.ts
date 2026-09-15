import { describe, expect, it } from "vitest";
import { customApiConfigSchema } from "./schemas";
import { CUSTOM_API_INTEGRATION_ID, customApiIntegrationDefinition } from "./definition";

describe("custom-api definition", () => {
  it("is a read-only GET adapter with optional secrets", () => {
    expect(customApiIntegrationDefinition.id).toBe(CUSTOM_API_INTEGRATION_ID);
    expect(customApiIntegrationDefinition.displayName).toBe("API personnalisée");
    expect(customApiIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(customApiIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "bearerToken",
      "apiKey",
    ]);
    expect(
      customApiIntegrationDefinition.secretFields.every((field) => field.required === false),
    ).toBe(true);
    expect(
      customApiConfigSchema.parse({
        endpoints: [{ key: "status", label: "Status", path: "/status" }],
      }).endpoints[0]?.path,
    ).toBe("/status");
  });
});
