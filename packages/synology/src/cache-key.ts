import { createHash } from "node:crypto";
import type { EncryptedSecretRow } from "@dashboard/integrations";

export const SYNOLOGY_OVERVIEW_CACHE_PREFIX = "synology.overview";

export function synologyOverviewCacheOperation(
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
  return `${SYNOLOGY_OVERVIEW_CACHE_PREFIX}:${digest}`;
}
