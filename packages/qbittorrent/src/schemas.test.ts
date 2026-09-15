import { describe, expect, it } from "vitest";
import {
  qbittorrentConfigSchema,
  qbittorrentSecretSchema,
  qbittorrentTorrentActionInputSchema,
} from "./schemas";

describe("qbittorrent schemas", () => {
  it("accepts a valid origin config and rejects malformed credentials", () => {
    expect(
      qbittorrentConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(
      qbittorrentSecretSchema.parse({
        username: "admin",
        password: "correct-horse-battery-staple",
      }),
    ).toEqual({
      username: "admin",
      password: "correct-horse-battery-staple",
    });
    expect(() => qbittorrentSecretSchema.parse({ username: "bad\nuser", password: "ok" })).toThrow(
      /visible ASCII/,
    );
    expect(() => qbittorrentSecretSchema.parse({ username: "ok", password: "bad\npass" })).toThrow(
      /visible ASCII/,
    );
    expect(() => qbittorrentSecretSchema.parse({ username: "", password: "ok" })).toThrow();
    expect(() => qbittorrentSecretSchema.parse({ username: "ok" })).toThrow();
  });

  it("accepts bounded torrent hashes and rejects all or malformed ids", () => {
    const hash = "8c212779b4abde7c6bc608063a0d008b7e40ce32";
    expect(
      qbittorrentTorrentActionInputSchema.parse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        hashes: [hash],
      }).hashes,
    ).toEqual([hash]);
    expect(() =>
      qbittorrentTorrentActionInputSchema.parse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        hashes: ["all"],
      }),
    ).toThrow();
    expect(() =>
      qbittorrentTorrentActionInputSchema.parse({
        integrationId: "not-a-uuid",
        hashes: [hash],
      }),
    ).toThrow();
  });
});
