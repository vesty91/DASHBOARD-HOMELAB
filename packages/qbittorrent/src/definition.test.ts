import { describe, expect, it } from "vitest";
import { qbittorrentConfigSchema } from "./schemas";
import { QBITTORRENT_INTEGRATION_ID, qbittorrentIntegrationDefinition } from "./definition";

describe("qbittorrent definition", () => {
  it("is a read-only transfer adapter with required username and password", () => {
    expect(qbittorrentIntegrationDefinition.id).toBe(QBITTORRENT_INTEGRATION_ID);
    expect(qbittorrentIntegrationDefinition.capabilities).toEqual(["status.read"]);
    expect(qbittorrentIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "username",
      "password",
    ]);
    expect(qbittorrentIntegrationDefinition.secretFields.every((field) => field.required)).toBe(
      true,
    );
    expect(
      qbittorrentConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
