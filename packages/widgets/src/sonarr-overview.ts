import { z } from "zod";
import type { WidgetContract } from "./types";

export const sonarrOverviewConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type SonarrOverviewConfig = z.infer<typeof sonarrOverviewConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const SONARR_OVERVIEW_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const sonarrOverviewDefaultConfig: SonarrOverviewConfig = {
  integrationId: SONARR_OVERVIEW_UNSET_INTEGRATION_ID,
};

export type SonarrOverviewDraftConfig = {
  integrationId: string;
};

export const sonarrOverviewDraftConfig: SonarrOverviewDraftConfig = {
  integrationId: "",
};

export const sonarrOverviewContract: WidgetContract<SonarrOverviewConfig> = {
  id: "sonarr-overview",
  version: 1,
  name: "Aperçu Sonarr",
  description: "Version, séries, file d'attente et santé Sonarr en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: sonarrOverviewDefaultConfig,
  configSchema: sonarrOverviewConfigSchema,
  publicSafe: false,
};

export type SonarrOverviewView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      version: string | null;
      seriesCount: number | null;
      queueTotalCount: number | null;
      healthErrors: number | null;
      healthWarnings: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
