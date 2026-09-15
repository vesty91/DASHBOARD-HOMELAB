import { describe, expect, it } from "vitest";
import { prowlarrConfigSchema, prowlarrSecretSchema } from "./schemas";

describe("prowlarr schemas", () => {
  it("accepts a valid origin config and rejects malformed API keys", () => {
    expect(
      prowlarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(prowlarrSecretSchema.parse({ apiKey: "notareal-prowlarr-apikey-0123456789" })).toEqual({
      apiKey: "notareal-prowlarr-apikey-0123456789",
    });
    expect(() => prowlarrSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => prowlarrSecretSchema.parse({ apiKey: "" })).toThrow();
    expect(() => prowlarrSecretSchema.parse({})).toThrow();
  });
});
