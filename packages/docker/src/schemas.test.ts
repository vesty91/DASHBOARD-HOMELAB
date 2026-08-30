import { describe, expect, it } from "vitest";
import { TEST_OTHER_CA_PEM, TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { dockerConfigSchema } from "./schemas";

describe("dockerConfigSchema trustedCaPem", () => {
  it("normalizes a valid CA and a small bundle", () => {
    const single = dockerConfigSchema.parse({
      verifyTls: true,
      timeoutMs: 8000,
      trustedCaPem: `  \n${TEST_TRUSTED_CA_PEM}\n  `,
    });
    expect(single.trustedCaPem).toContain("-----BEGIN CERTIFICATE-----");
    const bundle = dockerConfigSchema.parse({
      verifyTls: true,
      timeoutMs: 8000,
      trustedCaPem: `${TEST_TRUSTED_CA_PEM}\n${TEST_OTHER_CA_PEM}`,
    });
    expect(bundle.trustedCaPem?.split("-----BEGIN CERTIFICATE-----")).toHaveLength(3);
    expect(
      dockerConfigSchema.parse({ verifyTls: true, timeoutMs: 8000, trustedCaPem: "   " }),
    ).toEqual({ verifyTls: true, timeoutMs: 8000 });
  });

  it("rejects a trusted CA when TLS verification is disabled", () => {
    const parsed = dockerConfigSchema.safeParse({
      verifyTls: false,
      timeoutMs: 8000,
      trustedCaPem: TEST_TRUSTED_CA_PEM,
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path.includes("trustedCaPem"))).toBe(true);
    }
  });

  it.each([
    ["private key", "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----"],
    ["RSA private key", "-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----"],
    ["EC private key", "-----BEGIN EC PRIVATE KEY-----\nMHcC\n-----END EC PRIVATE KEY-----"],
    ["garbage", "not-a-pem"],
  ])("rejects %s", (_label, trustedCaPem) => {
    expect(
      dockerConfigSchema.safeParse({ verifyTls: true, timeoutMs: 8000, trustedCaPem }).success,
    ).toBe(false);
  });
});
