import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SecretError } from "./errors";
import type { SecretKeyring } from "./keyring";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD_PREFIX = "dashboard.integration-secret.v1";

export function buildSecretAad(integrationId: string, key: string, keyVersion: number): Buffer {
  return Buffer.from(`${AAD_PREFIX}:${integrationId}:${key}:${keyVersion}`, "utf8");
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

export function encryptSecret(
  keyring: SecretKeyring,
  input: { integrationId: string; key: string; plaintext: string },
): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyring.currentKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(buildSecretAad(input.integrationId, input.key, keyring.currentVersion));
  const ciphertext = Buffer.concat([cipher.update(input.plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: keyring.currentVersion,
  };
}

export function decryptSecret(
  keyring: SecretKeyring,
  input: {
    integrationId: string;
    key: string;
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
  },
): string {
  const master = keyring.getKey(input.keyVersion);
  try {
    const decipher = createDecipheriv(ALGORITHM, master, Buffer.from(input.iv, "base64"), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(buildSecretAad(input.integrationId, input.key, input.keyVersion));
    decipher.setAuthTag(Buffer.from(input.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof SecretError) throw error;
    throw new SecretError("DECRYPT_FAILED", "Unable to decrypt secret");
  }
}
