import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { mapPlaybackMode, mapServerInfo, mapSessions } from "./dto";

const SECRET = "VERY-UNLIKELY-JF-SECRET";

describe("mapPlaybackMode", () => {
  it("maps official PlayMethod values only", () => {
    expect(mapPlaybackMode("DirectPlay")).toBe("direct-play");
    expect(mapPlaybackMode("DirectStream")).toBe("direct-stream");
    expect(mapPlaybackMode("Transcode")).toBe("transcode");
    expect(mapPlaybackMode("Direct Play")).toBe("direct-play");
    expect(mapPlaybackMode(SECRET)).toBeNull();
    expect(mapPlaybackMode(undefined)).toBeNull();
  });
});

describe("mapServerInfo", () => {
  it("keeps safe fields and redacts credential reflections", () => {
    const server = mapServerInfo(
      {
        ServerName: `Home-${SECRET}`,
        Version: "10.10.7",
        ProductName: "Jellyfin Server",
        OperatingSystem: "Linux",
        StartupWizardCompleted: true,
        HasPendingRestart: false,
        LocalAddress: "http://192.168.1.10:8096",
        TranscodingTempPath: "/var/cache/secret",
        ProgramDataPath: "/var/lib/jellyfin",
      },
      [SECRET],
    );
    expect(server).toEqual({
      serverName: "Home-[REDACTED]",
      version: "10.10.7",
      productName: "Jellyfin Server",
      operatingSystem: "Linux",
      startupWizardCompleted: true,
      hasPendingRestart: false,
    });
    expect(JSON.stringify(server)).not.toContain(SECRET);
    expect(JSON.stringify(server)).not.toContain("192.168");
    expect(JSON.stringify(server)).not.toContain("/var/");
  });

  it("rejects a non-object payload", () => {
    expect(() => mapServerInfo([])).toThrow(IntegrationError);
  });
});

describe("mapSessions", () => {
  it("anonymizes users and never invents a playback mode", () => {
    const mapped = mapSessions(
      [
        {
          Id: "session-1",
          UserName: "alice",
          UserId: "user-guid",
          Client: "Jellyfin Web",
          DeviceName: "Living Room",
          DeviceId: "device-guid",
          RemoteEndPoint: "10.0.0.8",
          IsActive: true,
          NowPlayingItem: { Name: "Movie", Type: "Movie", ProductionYear: 2024, Path: "/data/x" },
          PlayState: { IsPaused: false, PlayMethod: "Transcode" },
          TranscodingInfo: { CompletionPercentage: 42.5, Bitrate: 8_000_000 },
        },
        {
          Id: "session-2",
          UserName: SECRET,
          IsActive: true,
          PlayState: { PlayMethod: SECRET },
        },
      ],
      [SECRET],
    );
    expect(mapped.activeCount).toBe(2);
    expect(mapped.sessions[0]).toMatchObject({
      id: "session-1",
      userLabel: "alice",
      playbackMode: "transcode",
      transcoding: { progressPercent: 42.5, bitrate: 8_000_000 },
      nowPlaying: { name: "Movie", type: "Movie", year: 2024 },
    });
    expect(mapped.sessions[1]?.userLabel).toBe("[REDACTED]");
    expect(mapped.sessions[1]?.playbackMode).toBeNull();
    expect(JSON.stringify(mapped)).not.toContain(SECRET);
    expect(JSON.stringify(mapped)).not.toContain("user-guid");
    expect(JSON.stringify(mapped)).not.toContain("10.0.0.8");
    expect(JSON.stringify(mapped)).not.toContain("/data/x");
  });
});
