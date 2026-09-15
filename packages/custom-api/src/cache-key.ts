import { createHash } from "node:crypto";
import type { EncryptedSecretRow } from "@dashboard/integrations";
import type { CustomApiDisplayMode } from "./types";

export const CUSTOM_API_VALUE_CACHE_PREFIX = "custom-api.value";
export const CUSTOM_API_OVERVIEW_CACHE_PREFIX = "custom-api.overview";

function secretFingerprint(secrets: readonly EncryptedSecretRow[]): string {
  return [...secrets]
    .map((row) => [row.key, row.ciphertext, row.iv, row.authTag, String(row.keyVersion)].join("\0"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .join("\n");
}

export function customApiValueFingerprint(
  endpointKey: string,
  jsonPath: string,
  display: CustomApiDisplayMode,
): string {
  return createHash("sha256")
    .update(endpointKey)
    .update("\0")
    .update(jsonPath)
    .update("\0")
    .update(display)
    .digest("hex");
}

export function customApiValueCacheOperation(
  configRevision: number,
  secrets: readonly EncryptedSecretRow[],
  queryFingerprint: string,
  refreshGeneration = 0,
): string {
  const digest = createHash("sha256")
    .update(String(configRevision))
    .update("\n")
    .update(String(refreshGeneration))
    .update("\n")
    .update(queryFingerprint)
    .update("\n")
    .update(secretFingerprint(secrets))
    .digest("hex");
  return `${CUSTOM_API_VALUE_CACHE_PREFIX}:${digest}`;
}

export function customApiOverviewCacheOperation(
  configRevision: number,
  secrets: readonly EncryptedSecretRow[],
  refreshGeneration = 0,
): string {
  const digest = createHash("sha256")
    .update(String(configRevision))
    .update("\n")
    .update(String(refreshGeneration))
    .update("\n")
    .update(secretFingerprint(secrets))
    .digest("hex");
  return `${CUSTOM_API_OVERVIEW_CACHE_PREFIX}:${digest}`;
}

export function overviewFailureCacheOperation(cacheOperation: string): string {
  return `${cacheOperation}:failure`;
}
