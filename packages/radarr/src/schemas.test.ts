import { describe, expect, it } from "vitest";
import { radarrConfigSchema, radarrSecretSchema } from "./schemas";

describe("radarr schemas", () => {
  it("accepts a valid origin config and rejects malformed API keys", () => {
    expect(
      radarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(radarrSecretSchema.parse({ apiKey: "notareal-radarr-apikey-0123456789" })).toEqual({
      apiKey: "notareal-radarr-apikey-0123456789",
    });
    expect(() => radarrSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => radarrSecretSchema.parse({ apiKey: "" })).toThrow();
    expect(() => radarrSecretSchema.parse({})).toThrow();
  });
});
