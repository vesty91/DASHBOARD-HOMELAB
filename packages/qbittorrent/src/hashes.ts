import { IntegrationError } from "@dashboard/integrations";

export const QBITTORRENT_HASH_MAX = 8;
const HASH_PATTERN = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/u;

export function normalizeQbittorrentHashes(raw: readonly string[]): readonly string[] {
  if (!Array.isArray(raw) || raw.length === 0)
    throw new IntegrationError("VALIDATION_ERROR", "At least one torrent hash is required");
  if (raw.length > QBITTORRENT_HASH_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Too many torrent hashes");
  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string")
      throw new IntegrationError("VALIDATION_ERROR", "Invalid torrent hash");
    const normalized = value.trim().toLocaleLowerCase("und");
    if (normalized === "all")
      throw new IntegrationError("VALIDATION_ERROR", "Bulk all-hashes actions are not allowed");
    if (!HASH_PATTERN.test(normalized))
      throw new IntegrationError("VALIDATION_ERROR", "Invalid torrent hash");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    hashes.push(normalized);
  }
  if (hashes.length === 0)
    throw new IntegrationError("VALIDATION_ERROR", "At least one torrent hash is required");
  return hashes;
}

export function qbittorrentHashesFormBody(hashes: readonly string[]): string {
  return new URLSearchParams({ hashes: hashes.join("|") }).toString();
}

export function qbittorrentHashesResourceId(hashes: readonly string[]): string {
  const first = hashes[0];
  if (!first)
    throw new IntegrationError("VALIDATION_ERROR", "At least one torrent hash is required");
  if (hashes.length === 1) return first;
  return `batch-${hashes.length}-${first.slice(0, 12)}`;
}
