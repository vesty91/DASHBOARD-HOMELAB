import { z } from "zod";
import type { WidgetContract } from "./types";

export const jellyfinSessionsConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type JellyfinSessionsConfig = z.infer<typeof jellyfinSessionsConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const jellyfinSessionsDefaultConfig: JellyfinSessionsConfig = {
  integrationId: JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
};

export type JellyfinSessionsDraftConfig = {
  integrationId: string;
};

export const jellyfinSessionsDraftConfig: JellyfinSessionsDraftConfig = {
  integrationId: "",
};

export const jellyfinSessionsContract: WidgetContract<JellyfinSessionsConfig> = {
  id: "jellyfin-sessions",
  version: 1,
  name: "Sessions Jellyfin",
  description: "Affiche les sessions actives et le mode de lecture ou de transcodage Jellyfin.",
  category: "media",
  defaultSize: { w: 4, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: jellyfinSessionsDefaultConfig,
  configSchema: jellyfinSessionsConfigSchema,
  publicSafe: false,
};

export type JellyfinPlaybackMode = "direct-play" | "direct-stream" | "transcode";

export interface JellyfinSessionViewItem {
  id: string;
  userLabel: string;
  client: string | null;
  deviceName: string | null;
  paused: boolean | null;
  nowPlayingName: string | null;
  playbackMode: JellyfinPlaybackMode | null;
  transcodeProgressPercent: number | null;
}

export type JellyfinSessionsView =
  | {
      status: "ready";
      serverName: string | null;
      version: string | null;
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      activeCount: number;
      sessions: readonly JellyfinSessionViewItem[];
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
