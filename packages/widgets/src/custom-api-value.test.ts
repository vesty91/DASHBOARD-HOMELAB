import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
  customApiValueConfigSchema,
  customApiValueContract,
} from "./custom-api-value";

describe("custom-api-value widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(customApiValueContract.publicSafe).toBe(false);
    expect(customApiValueContract.id).toBe("custom-api-value");
    assertWidgetContract(customApiValueContract);
    expect(customApiValueConfigSchema.parse(customApiValueContract.defaultConfig)).toEqual({
      integrationId: CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
      endpointKey: "status",
      jsonPath: "status",
      display: "text",
    });
    expect(() =>
      customApiValueConfigSchema.parse({
        integrationId: CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
        endpointKey: "status",
        jsonPath: "__proto__.x",
        display: "text",
      }),
    ).toThrow();
  });
});
