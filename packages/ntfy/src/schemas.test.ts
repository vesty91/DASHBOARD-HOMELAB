import { describe, expect, it } from "vitest";
import { ntfyConfigSchema, ntfySecretSchema } from "./schemas";

describe("ntfy schemas", () => {
  it("accepts a valid origin config and an optional visible-ASCII token", () => {
    expect(
      ntfyConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(ntfySecretSchema.parse({})).toEqual({});
    expect(ntfySecretSchema.parse({ accessToken: "tk_abcdefghijklmnop0123456789" })).toEqual({
      accessToken: "tk_abcdefghijklmnop0123456789",
    });
    expect(() => ntfySecretSchema.parse({ accessToken: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => ntfySecretSchema.parse({ accessToken: "" })).toThrow();
  });
});
