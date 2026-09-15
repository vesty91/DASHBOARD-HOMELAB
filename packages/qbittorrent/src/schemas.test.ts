import { describe, expect, it } from "vitest";
import { qbittorrentConfigSchema, qbittorrentSecretSchema } from "./schemas";

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
});
