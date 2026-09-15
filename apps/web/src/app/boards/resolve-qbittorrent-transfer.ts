import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { QbittorrentOverview } from "@dashboard/qbittorrent";
import {
  QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID,
  type QbittorrentTransferView,
} from "@dashboard/widgets";

export interface QbittorrentBoardCaller {
  qbittorrent: {
    overview: {
      get: (input: { integrationId: string }) => Promise<QbittorrentOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(
  overview: QbittorrentOverview,
): Extract<QbittorrentTransferView, { status: "ready" }> {
  const torrents = overview.torrents.data;
  return {
    status: "ready",
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    downloadSpeedBps: overview.transfer.data?.downloadSpeedBps ?? null,
    uploadSpeedBps: overview.transfer.data?.uploadSpeedBps ?? null,
    active: torrents === null ? null : torrents.downloading + torrents.uploading,
    queued: torrents?.queued ?? null,
  };
}

export async function resolveQbittorrentTransferViews(
  snapshot: BoardSnapshot,
  caller: QbittorrentBoardCaller,
): Promise<Record<string, QbittorrentTransferView>> {
  const views: Record<string, QbittorrentTransferView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "qbittorrent-transfer" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.qbittorrent.overview.get({ integrationId: config.integrationId }),
      );
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
