import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  QBITTORRENT_TORRENTS_MAX,
  classifyTorrentState,
  isQbittorrentLoginOk,
  mapTorrents,
  mapTransfer,
  mapVersion,
  parseJsonValue,
} from "./dto";
import { parseQbittorrentSid } from "./sid";

const PASSWORD = "correct-horse-battery-staple";
const SID = "QB-SID-SUPER-SECRET-001";

describe("qbittorrent dto", () => {
  it("accepts Ok. login bodies and parses a strict SID cookie", () => {
    expect(isQbittorrentLoginOk("Ok.")).toBe(true);
    expect(isQbittorrentLoginOk("Ok.\n")).toBe(true);
    expect(isQbittorrentLoginOk("Fails.")).toBe(false);
    expect(parseQbittorrentSid([`SID=${SID}; Path=/; HttpOnly`, "OTHER=ignore; Path=/"])).toBe(SID);
    expect(() => parseQbittorrentSid(["OTHER=ignore; Path=/"])).toThrow(IntegrationError);
    expect(() => parseQbittorrentSid([`SID=${"x".repeat(257)}`])).toThrow(IntegrationError);
    expect(() => parseQbittorrentSid([`SID=bad\nsid`])).toThrow(IntegrationError);
  });

  it("maps version text without secrets and rejects extra transfer blobs", () => {
    expect(mapVersion("v4.6.5", [PASSWORD, SID])).toEqual({ version: "v4.6.5" });
    expect(mapVersion(PASSWORD, [PASSWORD])).toEqual({ version: "[REDACTED]" });
    expect(mapVersion("bad\nver", [PASSWORD])).toEqual({ version: null });
    const mapped = mapTransfer({
      dl_info_speed: 1024,
      up_info_speed: 256,
      connection_status: "connected",
      dl_info_data: 9_999_999,
      up_info_data: 8_888_888,
      dht_nodes: 120,
    });
    expect(mapped).toEqual({
      downloadSpeedBps: 1024,
      uploadSpeedBps: 256,
      connectionStatus: "connected",
    });
    expect(JSON.stringify(mapped)).not.toContain("9999999");
    expect(JSON.stringify(mapped)).not.toContain("dht");
    expect(() => mapTransfer({ dl_info_speed: -1, up_info_speed: 0 })).toThrow(IntegrationError);
    expect(() => mapTransfer({ dl_info_speed: 1, up_info_speed: Number.NaN })).toThrow(
      IntegrationError,
    );
  });

  it("counts torrent states without names, hashes, magnets or paths", () => {
    const mapped = mapTorrents([
      {
        name: "Secret.Movie",
        hash: "abc123",
        magnet_uri: "magnet:?xt=urn:btih:abc123",
        save_path: "/downloads/secret",
        tracker: "https://tracker.example/announce",
        comment: "private",
        state: "downloading",
      },
      { name: "Other", state: "uploading", files: [{ name: "file.bin" }] },
      { state: "stalledDL" },
      { state: "queuedUP" },
      { state: "pausedDL" },
      { state: "stoppedUP" },
      { state: "error" },
    ]);
    expect(mapped).toEqual({
      downloading: 1,
      uploading: 1,
      stalled: 1,
      queued: 1,
      paused: 2,
      other: 1,
    });
    expect(JSON.stringify(mapped)).not.toContain("Secret.Movie");
    expect(JSON.stringify(mapped)).not.toContain("abc123");
    expect(JSON.stringify(mapped)).not.toContain("magnet");
    expect(JSON.stringify(mapped)).not.toContain("/downloads");
    expect(JSON.stringify(mapped)).not.toContain("tracker.example");
    expect(classifyTorrentState("forcedDL")).toBe("downloading");
    expect(() =>
      mapTorrents(Array.from({ length: QBITTORRENT_TORRENTS_MAX + 1 }, () => ({ state: "error" }))),
    ).toThrow(/oversized/i);
    expect(() => mapTorrents({ torrents: [] })).toThrow(IntegrationError);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
