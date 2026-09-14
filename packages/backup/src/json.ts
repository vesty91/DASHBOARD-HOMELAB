import { createHash, timingSafeEqual } from "node:crypto";
import { BackupError } from "./errors";

const FORBIDDEN_KEY_ALIASES = new Set([
  "password",
  "apikey",
  "token",
  "secret",
  "sid",
  "synotoken",
  "accesstoken",
  "refreshtoken",
  "plaintext",
  "privatekey",
  "authorization",
]);

const ALLOWED_KEY_ALIASES = new Set([
  "passwordhash",
  "ciphertext",
  "authtag",
  "iv",
  "keyversion",
  "key",
]);

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortDeep(record[key])]),
    );
  }
  return value;
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function equalSha256(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/iu.test(left) || !/^[0-9a-f]{64}$/iu.test(right)) return false;
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  if (leftBytes.length !== rightBytes.length) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/gu, "");
}

export function assertNoPlaintextSecrets(value: unknown, path = "archive"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaintextSecrets(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const alias = normalizeKey(key);
    if (FORBIDDEN_KEY_ALIASES.has(alias) && !ALLOWED_KEY_ALIASES.has(alias)) {
      throw new BackupError(
        "VALIDATION_ERROR",
        `Backup archive contains a forbidden field at ${path}`,
      );
    }
    assertNoPlaintextSecrets(child, `${path}.${key}`);
  }
}
