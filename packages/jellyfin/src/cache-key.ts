import { createHash } from "node:crypto";
import type { EncryptedSecretRow } from "@dashboard/integrations";

export const JELLYFIN_OVERVIEW_CACHE_PREFIX = "jellyfin.overview";

export function jellyfinOverviewCacheOperation(
  configRevision: number,
  secrets: readonly EncryptedSecretRow[],
  refreshGeneration = 0,
): string {
  const fingerprint = [...secrets]
    .map((row) => [row.key, row.ciphertext, row.iv, row.authTag, String(row.keyVersion)].join("\0"))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const digest = createHash("sha256")
    .update(String(configRevision))
    .update("\n")
    .update(String(refreshGeneration))
    .update("\n")
    .update(fingerprint.join("\n"))
    .digest("hex");
  return `${JELLYFIN_OVERVIEW_CACHE_PREFIX}:${digest}`;
}

export function overviewFailureCacheOperation(cacheOperation: string): string {
  return `${cacheOperation}:failure`;
}
