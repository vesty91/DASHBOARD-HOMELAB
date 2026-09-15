import { describe, expect, it } from "vitest";
import { seerrConfigSchema, seerrSecretSchema } from "./schemas";

describe("seerr schemas", () => {
  it("accepts a valid origin config and rejects malformed API keys", () => {
    expect(
      seerrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(seerrSecretSchema.parse({ apiKey: "notareal-seerr-apikey-0123456789" })).toEqual({
      apiKey: "notareal-seerr-apikey-0123456789",
    });
    expect(() => seerrSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => seerrSecretSchema.parse({ apiKey: "" })).toThrow();
    expect(() => seerrSecretSchema.parse({})).toThrow();
  });
});
