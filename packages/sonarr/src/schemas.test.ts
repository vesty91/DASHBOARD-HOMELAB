import { describe, expect, it } from "vitest";
import { sonarrConfigSchema, sonarrSecretSchema } from "./schemas";

describe("sonarr schemas", () => {
  it("accepts a valid origin config and rejects malformed API keys", () => {
    expect(
      sonarrConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(sonarrSecretSchema.parse({ apiKey: "notareal-sonarr-apikey-0123456789" })).toEqual({
      apiKey: "notareal-sonarr-apikey-0123456789",
    });
    expect(() => sonarrSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => sonarrSecretSchema.parse({ apiKey: "" })).toThrow();
    expect(() => sonarrSecretSchema.parse({})).toThrow();
  });
});
