import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveJellyfinSessionViews } from "./resolve-jellyfin-sessions";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "jellyfin-sessions",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveJellyfinSessionViews", () => {
  it("maps overview sessions and isolates permission errors", async () => {
    const views = await resolveJellyfinSessionViews(snapshot, {
      jellyfin: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-13T00:00:00.000Z",
            server: {
              status: "available",
              data: {
                serverName: "Home",
                version: "10.10.7",
                productName: "Jellyfin Server",
                operatingSystem: "Linux",
                startupWizardCompleted: true,
                hasPendingRestart: false,
              },
            },
            sessions: {
              status: "available",
              data: {
                activeCount: 1,
                sessions: [
                  {
                    id: "s1",
                    userLabel: "alice",
                    client: "Web",
                    deviceName: "TV",
                    isActive: true,
                    paused: false,
                    nowPlaying: { name: "Dune", type: "Movie", year: 2021 },
                    playbackMode: "direct-play",
                    transcoding: null,
                  },
                ],
              },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      serverName: "Home",
      activeCount: 1,
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveJellyfinSessionViews(snapshot, {
      jellyfin: {
        overview: {
          get: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "no" });
          },
        },
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });
  });
});
