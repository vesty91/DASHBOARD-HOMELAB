import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./crypto";
import { SecretError } from "./errors";
import { createEnvKeyring, parseSecretEncryptionKey } from "./keyring";

const master = Buffer.alloc(32, 9).toString("base64");
const other = Buffer.alloc(32, 3).toString("base64");

function tamper(value: string): string {
  const buffer = Buffer.from(value, "base64");
  const first = buffer[0];
  if (first === undefined) throw new Error("empty buffer");
  buffer[0] = first ^ 0xff;
  return buffer.toString("base64");
}

describe("secret encryption key", () => {
  it("accepts base64 that decodes to exactly 32 bytes", () => {
    expect(parseSecretEncryptionKey(master)).toHaveLength(32);
  });
  it("rejects keys shorter or longer than 32 bytes", () => {
    expect(() => parseSecretEncryptionKey(Buffer.alloc(31, 1).toString("base64"))).toThrow(
      SecretError,
    );
    expect(() => parseSecretEncryptionKey(Buffer.alloc(33, 1).toString("base64"))).toThrow(
      SecretError,
    );
  });
  it("does not create an ephemeral keyring when the env is absent", () => {
    expect(createEnvKeyring(undefined)).toBeUndefined();
    expect(createEnvKeyring("")).toBeUndefined();
  });
});

describe("AES-256-GCM secrets", () => {
  const keyring = createEnvKeyring(master)!;
  const input = {
    integrationId: "11111111-1111-4111-8111-111111111111",
    key: "apiKey",
    plaintext: "my-super-secret-token",
  };

  it("roundtrips and uses a unique IV per encrypt", () => {
    const first = encryptSecret(keyring, input);
    const second = encryptSecret(keyring, input);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.authTag).toHaveLength(24);
    expect(decryptSecret(keyring, { ...input, ...first })).toBe(input.plaintext);
    expect(decryptSecret(keyring, { ...input, ...second })).toBe(input.plaintext);
  });

  it.each(["ciphertext", "authTag", "iv"] as const)("fails when %s is modified", (field) => {
    const encrypted = encryptSecret(keyring, input);
    expect(() =>
      decryptSecret(keyring, { ...input, ...encrypted, [field]: tamper(encrypted[field]) }),
    ).toThrow(SecretError);
  });

  it("binds AAD to integrationId and secret key", () => {
    const encrypted = encryptSecret(keyring, input);
    expect(() =>
      decryptSecret(keyring, {
        ...encrypted,
        integrationId: "22222222-2222-4222-8222-222222222222",
        key: input.key,
      }),
    ).toThrow(SecretError);
    expect(() =>
      decryptSecret(keyring, { ...encrypted, integrationId: input.integrationId, key: "token" }),
    ).toThrow(SecretError);
  });

  it("fails with the wrong master key and an unknown keyVersion", () => {
    const encrypted = encryptSecret(keyring, input);
    expect(() => decryptSecret(createEnvKeyring(other)!, { ...input, ...encrypted })).toThrow(
      SecretError,
    );
    expect(() => decryptSecret(keyring, { ...input, ...encrypted, keyVersion: 2 })).toThrow(
      SecretError,
    );
    try {
      decryptSecret(keyring, { ...input, ...encrypted, keyVersion: 2 });
    } catch (error) {
      expect(error).toMatchObject({ code: "UNKNOWN_KEY_VERSION" });
      expect(String(error)).not.toContain(input.plaintext);
    }
  });

  it("never includes plaintext in decrypt errors", () => {
    const encrypted = encryptSecret(keyring, input);
    try {
      decryptSecret(keyring, { ...input, ...encrypted, ciphertext: tamper(encrypted.ciphertext) });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(SecretError);
      expect(String(error)).not.toContain(input.plaintext);
    }
  });
});
