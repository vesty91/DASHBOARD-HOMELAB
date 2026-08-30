import { describe, expect, it } from "vitest";
import { TEST_OTHER_CA_PEM, TEST_TRUSTED_CA_PEM } from "./test-tls-fixtures";
import {
  MAX_TRUSTED_CA_BYTES,
  MAX_TRUSTED_CA_CERTS,
  normalizeOptionalTrustedCaPem,
  normalizeTrustedCaPem,
} from "./trusted-ca";

const RSA_PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKjC8h+example
-----END RSA PRIVATE KEY-----`;

const EC_PRIVATE_KEY = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIOexample
-----END EC PRIVATE KEY-----`;

const ENCRYPTED_PRIVATE_KEY = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIIFLTBXBgkqhkiG9w0BBQ0wSjApBgkqhkiG9w0BBQwwHAQIexample
-----END ENCRYPTED PRIVATE KEY-----`;

const PKCS8_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9
-----END PRIVATE KEY-----`;

describe("trusted CA PEM validation", () => {
  it("accepts a single valid CA and a small bundle", () => {
    const single = normalizeTrustedCaPem(TEST_TRUSTED_CA_PEM);
    expect(single).toContain("-----BEGIN CERTIFICATE-----");
    expect(single).toContain("-----END CERTIFICATE-----");
    const bundle = normalizeTrustedCaPem(`${TEST_TRUSTED_CA_PEM}\n${TEST_OTHER_CA_PEM}`);
    expect(bundle.split("-----BEGIN CERTIFICATE-----")).toHaveLength(3);
    expect(normalizeOptionalTrustedCaPem("   ")).toBeUndefined();
    expect(normalizeOptionalTrustedCaPem(undefined)).toBeUndefined();
  });

  it.each([
    ["PKCS#8 private key", PKCS8_PRIVATE_KEY],
    ["RSA private key", RSA_PRIVATE_KEY],
    ["EC private key", EC_PRIVATE_KEY],
    ["encrypted private key", ENCRYPTED_PRIVATE_KEY],
    ["garbage", "not-a-pem"],
    ["partial PEM", "-----BEGIN CERTIFICATE-----\nMIIB"],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(() => normalizeTrustedCaPem(value)).toThrow(/Trusted CA|Private keys|CERTIFICATE/u);
  });

  it("rejects oversized input and too many certificates", () => {
    const oversized = `${"A".repeat(MAX_TRUSTED_CA_BYTES + 1)}`;
    expect(() => normalizeTrustedCaPem(oversized)).toThrow(/size limit/u);
    const tooMany = Array.from(
      { length: MAX_TRUSTED_CA_CERTS + 1 },
      () => TEST_TRUSTED_CA_PEM,
    ).join("\n");
    expect(() => normalizeTrustedCaPem(tooMany)).toThrow(/certificate limit/u);
  });

  it("rejects non-whitespace text outside PEM blocks", () => {
    expect(() => normalizeTrustedCaPem(`${TEST_TRUSTED_CA_PEM}\nsmuggled-config`)).toThrow(
      /non-certificate/u,
    );
  });
});
