import { SecretError } from "./errors";

export interface SecretKeyring {
  readonly currentVersion: number;
  readonly currentKey: Buffer;
  getKey(version: number): Buffer;
}

export function parseSecretEncryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  if (!trimmed)
    throw new SecretError("INVALID_KEY", "SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes");
  let decoded: Buffer;
  try {
    decoded = Buffer.from(trimmed, "base64");
  } catch {
    throw new SecretError("INVALID_KEY", "SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }
  if (decoded.length !== 32)
    throw new SecretError("INVALID_KEY", "SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes");
  const compactInput = trimmed.replace(/=+$/u, "");
  const compactNormalized = decoded.toString("base64").replace(/=+$/u, "");
  if (compactInput !== compactNormalized)
    throw new SecretError("INVALID_KEY", "SECRET_ENCRYPTION_KEY must be valid base64");
  return decoded;
}

export function createEnvKeyring(value: string | undefined): SecretKeyring | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const currentKey = parseSecretEncryptionKey(value);
  return {
    currentVersion: 1,
    currentKey,
    getKey(version: number): Buffer {
      if (version !== 1)
        throw new SecretError("UNKNOWN_KEY_VERSION", "Unknown encryption key version");
      return currentKey;
    },
  };
}
