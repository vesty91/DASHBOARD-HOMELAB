import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveQbittorrentTransferViews } from "./resolve-qbittorrent-transfer";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "qbittorrent-transfer",
      runtimeStatus: "ready",
      config: { integrationId: "11111111-1111-4111-8111-111111111111" },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveQbittorrentTransferViews", () => {
  it("maps speeds and torrent counters without names and isolates permission errors", async () => {
    const views = await resolveQbittorrentTransferViews(snapshot, {
      qbittorrent: {
        overview: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            version: { status: "available", data: { version: "v4.6.5" } },
            transfer: {
              status: "available",
              data: {
                downloadSpeedBps: 1024,
                uploadSpeedBps: 256,
                connectionStatus: "connected",
              },
            },
            torrents: {
              status: "available",
              data: {
                downloading: 1,
                uploading: 1,
                stalled: 0,
                queued: 3,
                paused: 0,
                other: 0,
              },
            },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      downloadSpeedBps: 1024,
      uploadSpeedBps: 256,
      active: 2,
      queued: 3,
    });
    expect(JSON.stringify(views)).not.toMatch(/magnet|hash|save_path|SID|password/u);
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveQbittorrentTransferViews(snapshot, {
      qbittorrent: {
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
