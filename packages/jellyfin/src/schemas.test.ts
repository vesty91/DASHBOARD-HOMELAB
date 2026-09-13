import { describe, expect, it } from "vitest";
import { TEST_OTHER_CA_PEM, TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { jellyfinConfigSchema, jellyfinSecretSchema } from "./schemas";

describe("jellyfinSecretSchema", () => {
  it("accepts a visible ASCII API key", () => {
    expect(jellyfinSecretSchema.parse({ apiKey: "JF-TOKEN_~!ok" })).toEqual({
      apiKey: "JF-TOKEN_~!ok",
    });
  });

  it.each(["", "KEY\n", "KEY\r", "KEY\t", "KEY SECRET", "é", "\u0000token"])(
    "rejects unsafe API key %j",
    (apiKey) => {
      expect(jellyfinSecretSchema.safeParse({ apiKey }).success).toBe(false);
    },
  );
});

describe("jellyfinConfigSchema", () => {
  it("normalizes a trusted CA and rejects it when TLS is disabled", () => {
    expect(
      jellyfinConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
        trustedCaPem: TEST_TRUSTED_CA_PEM,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(
      jellyfinConfigSchema.safeParse({
        verifyTls: false,
        timeoutMs: 8000,
        trustedCaPem: TEST_OTHER_CA_PEM,
      }).success,
    ).toBe(false);
  });
});
