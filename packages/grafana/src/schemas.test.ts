import { describe, expect, it } from "vitest";
import { grafanaConfigSchema, grafanaSecretSchema } from "./schemas";

describe("grafana schemas", () => {
  it("accepts a valid origin config and rejects malformed tokens", () => {
    expect(
      grafanaConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(
      grafanaSecretSchema.parse({ serviceAccountToken: "glsa_abcdefghijklmnop0123456789" }),
    ).toEqual({
      serviceAccountToken: "glsa_abcdefghijklmnop0123456789",
    });
    expect(() => grafanaSecretSchema.parse({ serviceAccountToken: "bad\nkey" })).toThrow(
      /visible ASCII/,
    );
    expect(() => grafanaSecretSchema.parse({ serviceAccountToken: "" })).toThrow();
    expect(() => grafanaSecretSchema.parse({})).toThrow();
  });
});
