import { describe, expect, it } from "vitest";
import { uptimeKumaConfigSchema, uptimeKumaSecretSchema } from "./schemas";

describe("uptime-kuma schemas", () => {
  it("accepts a valid origin config and rejects a control-character API key", () => {
    expect(
      uptimeKumaConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(() => uptimeKumaSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => uptimeKumaSecretSchema.parse({ apiKey: "bad\rkey" })).toThrow(/visible ASCII/);
    expect(() => uptimeKumaSecretSchema.parse({ apiKey: "" })).toThrow();
  });
});
