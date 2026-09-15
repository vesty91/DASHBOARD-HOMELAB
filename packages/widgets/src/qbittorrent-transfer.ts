import { z } from "zod";
import type { WidgetContract } from "./types";

export const qbittorrentTransferConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type QbittorrentTransferConfig = z.infer<typeof qbittorrentTransferConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const qbittorrentTransferDefaultConfig: QbittorrentTransferConfig = {
  integrationId: QBITTORRENT_TRANSFER_UNSET_INTEGRATION_ID,
};

export type QbittorrentTransferDraftConfig = {
  integrationId: string;
};

export const qbittorrentTransferDraftConfig: QbittorrentTransferDraftConfig = {
  integrationId: "",
};

export const qbittorrentTransferContract: WidgetContract<QbittorrentTransferConfig> = {
  id: "qbittorrent-transfer",
  version: 1,
  name: "Transfert qBittorrent",
  description: "Débits et compteurs de torrents qBittorrent en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: qbittorrentTransferDefaultConfig,
  configSchema: qbittorrentTransferConfigSchema,
  publicSafe: false,
};

export type QbittorrentTransferView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      downloadSpeedBps: number | null;
      uploadSpeedBps: number | null;
      active: number | null;
      queued: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
