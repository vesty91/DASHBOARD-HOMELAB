import { z } from "zod";
import type { WidgetContract } from "./types";

export const prowlarrStatusConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type ProwlarrStatusConfig = z.infer<typeof prowlarrStatusConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const PROWLARR_STATUS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const prowlarrStatusDefaultConfig: ProwlarrStatusConfig = {
  integrationId: PROWLARR_STATUS_UNSET_INTEGRATION_ID,
};

export type ProwlarrStatusDraftConfig = {
  integrationId: string;
};

export const prowlarrStatusDraftConfig: ProwlarrStatusDraftConfig = {
  integrationId: "",
};

export const prowlarrStatusContract: WidgetContract<ProwlarrStatusConfig> = {
  id: "prowlarr-status",
  version: 1,
  name: "Statut Prowlarr",
  description: "Version, indexeurs et santé Prowlarr en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: prowlarrStatusDefaultConfig,
  configSchema: prowlarrStatusConfigSchema,
  publicSafe: false,
};

export type ProwlarrStatusView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      version: string | null;
      indexerCount: number | null;
      enabledCount: number | null;
      indexerStatusCount: number | null;
      healthErrors: number | null;
      healthWarnings: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
