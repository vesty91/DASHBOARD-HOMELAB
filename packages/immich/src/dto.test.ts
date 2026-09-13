import { describe, expect, it } from "vitest";
import { mapHealth, mapServer, mapStats, mapStorage } from "./dto";

const API_KEY = "IM-API-SUPER-SECRET";

describe("immich dto", () => {
  it("projects official server payloads without URLs or EXIF", () => {
    const server = mapServer(
      { major: 1, minor: 142, patch: 3, prerelease: null },
      {
        version: "v1.142.3",
        licensed: false,
        repositoryUrl: "https://github.com/immich-app/immich",
        sourceUrl: "https://github.com/immich-app/immich/commit/abc",
        exiftool: "13.0",
      },
      [API_KEY],
    );
    expect(server).toEqual({ version: "v1.142.3", licensed: false });
    expect(JSON.stringify(server)).not.toMatch(/github|exif|commit/i);
  });

  it("treats only pong as healthy", () => {
    expect(mapHealth({ res: "pong" })).toEqual({ ok: true });
    expect(mapHealth({ res: "PONG" })).toEqual({ ok: true });
    expect(mapHealth({ res: "ok" })).toEqual({ ok: false });
  });

  it("keeps raw storage bytes and drops usageByUser from stats", () => {
    const storage = mapStorage({
      diskSize: "1 TB",
      diskUse: "100 GB",
      diskAvailable: "900 GB",
      diskSizeRaw: 1099511627776,
      diskUseRaw: 107374182400,
      diskAvailableRaw: 992137445376,
      diskUsagePercentage: 9.77,
    });
    expect(storage.diskSizeBytes).toBe(1099511627776);
    const stats = mapStats({
      photos: 12,
      videos: 3,
      usage: 4096,
      usageByUser: [{ userId: "u1", userName: "alice", photos: 12, videos: 3, usage: 4096 }],
    });
    expect(stats).toEqual({ photos: 12, videos: 3, usageBytes: 4096 });
    expect(JSON.stringify(stats)).not.toContain("alice");
  });

  it("redacts numeric values that equal the API key", () => {
    expect(mapStats({ photos: 1, videos: 0, usage: Number(API_KEY) || 0 }, [API_KEY]).photos).toBe(
      1,
    );
  });
});
