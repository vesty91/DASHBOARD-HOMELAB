import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { SecretError } from "./errors";
import type { SecretKeyring } from "./keyring";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const AAD_PREFIX = "dashboard.integration-secret.v1";
const PUSH_AAD_PREFIX = "dashboard.push-subscription.v1";

export function buildSecretAad(integrationId: string, key: string, keyVersion: number): Buffer {
  return Buffer.from(`${AAD_PREFIX}:${integrationId}:${key}:${keyVersion}`, "utf8");
}

export type PushSubscriptionSecretField = "endpoint" | "p256dh" | "auth";

export function buildPushSubscriptionAad(
  userId: string,
  subscriptionId: string,
  field: PushSubscriptionSecretField,
  keyVersion: number,
): Buffer {
  return Buffer.from(
    `${PUSH_AAD_PREFIX}:${userId}:${subscriptionId}:${field}:${keyVersion}`,
    "utf8",
  );
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function encryptWithAad(keyring: SecretKeyring, plaintext: string, aad: Buffer): EncryptedSecret {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, keyring.currentKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: keyring.currentVersion,
  };
}

function decryptWithAad(
  keyring: SecretKeyring,
  input: {
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
  },
  aad: Buffer,
): string {
  const master = keyring.getKey(input.keyVersion);
  try {
    const decipher = createDecipheriv(ALGORITHM, master, Buffer.from(input.iv, "base64"), {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAAD(aad);
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

export function encryptSecret(
  keyring: SecretKeyring,
  input: { integrationId: string; key: string; plaintext: string },
): EncryptedSecret {
  return encryptWithAad(
    keyring,
    input.plaintext,
    buildSecretAad(input.integrationId, input.key, keyring.currentVersion),
  );
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
  return decryptWithAad(
    keyring,
    input,
    buildSecretAad(input.integrationId, input.key, input.keyVersion),
  );
}

export function encryptPushSubscriptionField(
  keyring: SecretKeyring,
  input: {
    userId: string;
    subscriptionId: string;
    field: PushSubscriptionSecretField;
    plaintext: string;
  },
): EncryptedSecret {
  return encryptWithAad(
    keyring,
    input.plaintext,
    buildPushSubscriptionAad(
      input.userId,
      input.subscriptionId,
      input.field,
      keyring.currentVersion,
    ),
  );
}

export function decryptPushSubscriptionField(
  keyring: SecretKeyring,
  input: {
    userId: string;
    subscriptionId: string;
    field: PushSubscriptionSecretField;
    ciphertext: string;
    iv: string;
    authTag: string;
    keyVersion: number;
  },
): string {
  return decryptWithAad(
    keyring,
    input,
    buildPushSubscriptionAad(input.userId, input.subscriptionId, input.field, input.keyVersion),
  );
}
