import { describe, expect, it } from "vitest";
import {
  QBITTORRENT_HASH_MAX,
  normalizeQbittorrentHashes,
  qbittorrentHashesFormBody,
  qbittorrentHashesResourceId,
} from "./hashes";

const HASH_40 = "8c212779b4abde7c6bc608063a0d008b7e40ce32";
const HASH_64 = "a".repeat(64);

describe("qbittorrent hashes", () => {
  it("normalizes hex hashes, rejects all, and caps the batch size", () => {
    expect(normalizeQbittorrentHashes([` ${HASH_40.toUpperCase()} `, HASH_40])).toEqual([HASH_40]);
    expect(normalizeQbittorrentHashes([HASH_64])).toEqual([HASH_64]);
    expect(() => normalizeQbittorrentHashes(["all"])).toThrow(/all-hashes/i);
    expect(() => normalizeQbittorrentHashes(["ALL"])).toThrow(/all-hashes/i);
    expect(() => normalizeQbittorrentHashes(["zzzz"])).toThrow(/Invalid torrent hash/);
    expect(() =>
      normalizeQbittorrentHashes(Array.from({ length: QBITTORRENT_HASH_MAX + 1 }, () => HASH_40)),
    ).toThrow(/Too many torrent hashes/);
    expect(() => normalizeQbittorrentHashes([])).toThrow(/At least one/);
  });

  it("puts hashes in the form body and never uses the all token", () => {
    const second = "b".repeat(40);
    expect(qbittorrentHashesFormBody([HASH_40, second])).toBe(
      new URLSearchParams({ hashes: `${HASH_40}|${second}` }).toString(),
    );
    expect(qbittorrentHashesFormBody([HASH_40])).not.toContain("all");
    expect(qbittorrentHashesResourceId([HASH_40])).toBe(HASH_40);
    expect(qbittorrentHashesResourceId([HASH_40, second])).toBe(`batch-2-${HASH_40.slice(0, 12)}`);
  });
});
