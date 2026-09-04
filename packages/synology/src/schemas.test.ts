import { describe, expect, it } from "vitest";
import { TEST_OTHER_CA_PEM, TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { synologyConfigSchema, synologyEnrollDeviceSchema, synologySecretSchema } from "./schemas";

describe("synologyConfigSchema", () => {
  it("requires account in config and never accepts password there", () => {
    expect(
      synologyConfigSchema.parse({
        account: " monitor ",
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ account: "monitor", verifyTls: true, timeoutMs: 8000 });
    expect(synologyConfigSchema.safeParse({ verifyTls: true, timeoutMs: 8000 }).success).toBe(
      false,
    );
    expect(
      synologyConfigSchema.safeParse({
        account: "monitor",
        password: "nope",
        verifyTls: true,
        timeoutMs: 8000,
      }).success,
    ).toBe(true);
    expect(
      synologyConfigSchema.parse({
        account: "monitor",
        password: "nope",
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).not.toHaveProperty("password");
  });

  it("normalizes a valid CA and rejects private keys", () => {
    const single = synologyConfigSchema.parse({
      account: "monitor",
      verifyTls: true,
      timeoutMs: 8000,
      trustedCaPem: `  \n${TEST_TRUSTED_CA_PEM}\n  `,
    });
    expect(single.trustedCaPem).toContain("-----BEGIN CERTIFICATE-----");
    const bundle = synologyConfigSchema.parse({
      account: "monitor",
      verifyTls: true,
      timeoutMs: 8000,
      trustedCaPem: `${TEST_TRUSTED_CA_PEM}\n${TEST_OTHER_CA_PEM}`,
    });
    expect(bundle.trustedCaPem?.split("-----BEGIN CERTIFICATE-----")).toHaveLength(3);
  });

  it("rejects a trusted CA when TLS verification is disabled", () => {
    const parsed = synologyConfigSchema.safeParse({
      account: "monitor",
      verifyTls: false,
      timeoutMs: 8000,
      trustedCaPem: TEST_TRUSTED_CA_PEM,
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects private keys", () => {
    expect(
      synologyConfigSchema.safeParse({
        account: "monitor",
        verifyTls: true,
        timeoutMs: 8000,
        trustedCaPem: "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      }).success,
    ).toBe(false);
  });
});

describe("synologySecretSchema", () => {
  it("requires password and treats deviceId as optional", () => {
    expect(synologySecretSchema.parse({ password: "s3cret" })).toEqual({ password: "s3cret" });
    expect(synologySecretSchema.safeParse({}).success).toBe(false);
    expect(synologySecretSchema.parse({ password: "s3cret", deviceId: "did-1" })).toEqual({
      password: "s3cret",
      deviceId: "did-1",
    });
  });
});

describe("synologyEnrollDeviceSchema", () => {
  it("accepts a 4-8 digit OTP", () => {
    expect(
      synologyEnrollDeviceSchema.parse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        otpCode: "123456",
      }).otpCode,
    ).toBe("123456");
    expect(
      synologyEnrollDeviceSchema.safeParse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        otpCode: "12",
      }).success,
    ).toBe(false);
  });
});
