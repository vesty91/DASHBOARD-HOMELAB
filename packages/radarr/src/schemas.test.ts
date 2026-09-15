import { describe, expect, it } from "vitest";
import { radarrConfigSchema, radarrRefreshMovieInputSchema, radarrSecretSchema } from "./schemas";

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

  it("accepts a single positive movie id and rejects zero", () => {
    expect(
      radarrRefreshMovieInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        movieId: 20,
      }),
    ).toMatchObject({ movieId: 20 });
    expect(() =>
      radarrRefreshMovieInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        movieId: 0,
      }),
    ).toThrow();
  });
});
