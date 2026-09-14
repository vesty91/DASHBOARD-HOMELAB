import { z } from "zod";
import type { WidgetContract } from "./types";

export const grafanaStatusConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type GrafanaStatusConfig = z.infer<typeof grafanaStatusConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const GRAFANA_STATUS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const grafanaStatusDefaultConfig: GrafanaStatusConfig = {
  integrationId: GRAFANA_STATUS_UNSET_INTEGRATION_ID,
};

export type GrafanaStatusDraftConfig = {
  integrationId: string;
};

export const grafanaStatusDraftConfig: GrafanaStatusDraftConfig = {
  integrationId: "",
};

export const grafanaStatusContract: WidgetContract<GrafanaStatusConfig> = {
  id: "grafana-status",
  version: 1,
  name: "Statut Grafana",
  description: "Santé, tableaux de bord et alertes Grafana en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: grafanaStatusDefaultConfig,
  configSchema: grafanaStatusConfigSchema,
  publicSafe: false,
};

export type GrafanaStatusView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      version: string | null;
      database: "ok" | "failing" | null;
      dashboardCount: number | null;
      alertsFiring: number | null;
      alertsPending: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
