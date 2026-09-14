import { z } from "zod";
import type { WidgetContract } from "./types";

export const radarrOverviewConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type RadarrOverviewConfig = z.infer<typeof radarrOverviewConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const RADARR_OVERVIEW_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const radarrOverviewDefaultConfig: RadarrOverviewConfig = {
  integrationId: RADARR_OVERVIEW_UNSET_INTEGRATION_ID,
};

export type RadarrOverviewDraftConfig = {
  integrationId: string;
};

export const radarrOverviewDraftConfig: RadarrOverviewDraftConfig = {
  integrationId: "",
};

export const radarrOverviewContract: WidgetContract<RadarrOverviewConfig> = {
  id: "radarr-overview",
  version: 1,
  name: "Aperçu Radarr",
  description: "Version, films, file d'attente et santé Radarr en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: radarrOverviewDefaultConfig,
  configSchema: radarrOverviewConfigSchema,
  publicSafe: false,
};

export type RadarrOverviewView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      version: string | null;
      movieCount: number | null;
      queueTotalCount: number | null;
      healthErrors: number | null;
      healthWarnings: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
