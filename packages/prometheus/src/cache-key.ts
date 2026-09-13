import { createHash } from "node:crypto";
import type { EncryptedSecretRow } from "@dashboard/integrations";
import type { PrometheusValidatedQuery } from "./types";

export const PROMETHEUS_QUERY_CACHE_PREFIX = "prometheus.query";

export function prometheusQueryFingerprint(query: PrometheusValidatedQuery): string {
  const payload =
    query.mode === "instant"
      ? `instant\0${query.query}`
      : `range\0${query.query}\0${String(query.rangeSeconds)}\0${String(query.stepSeconds)}`;
  return createHash("sha256").update(payload).digest("hex");
}

export function prometheusQueryCacheOperation(
  configRevision: number,
  secrets: readonly EncryptedSecretRow[],
  queryFingerprint: string,
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
    .update(queryFingerprint)
    .update("\n")
    .update(fingerprint.join("\n"))
    .digest("hex");
  return `${PROMETHEUS_QUERY_CACHE_PREFIX}:${digest}`;
}

export function overviewFailureCacheOperation(cacheOperation: string): string {
  return `${cacheOperation}:failure`;
}
