import { z } from "zod";
import type { WidgetContract } from "./types";

export const immichStatsConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type ImmichStatsConfig = z.infer<typeof immichStatsConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const IMMICH_STATS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const immichStatsDefaultConfig: ImmichStatsConfig = {
  integrationId: IMMICH_STATS_UNSET_INTEGRATION_ID,
};

export type ImmichStatsDraftConfig = {
  integrationId: string;
};

export const immichStatsDraftConfig: ImmichStatsDraftConfig = {
  integrationId: "",
};

export const immichStatsContract: WidgetContract<ImmichStatsConfig> = {
  id: "immich-stats",
  version: 1,
  name: "Statistiques Immich",
  description: "Affiche l'état, les photos, les vidéos et le stockage Immich.",
  category: "media",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: immichStatsDefaultConfig,
  configSchema: immichStatsConfigSchema,
  publicSafe: false,
};

export type ImmichStatsView =
  | {
      status: "ready";
      version: string | null;
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      healthOk: boolean | null;
      photos: number | null;
      videos: number | null;
      diskUseBytes: number | null;
      diskSizeBytes: number | null;
      diskUsagePercent: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
