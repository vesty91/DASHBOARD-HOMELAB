import { z } from "zod";
import type { WidgetContract } from "./types";

export const uptimeKumaStatusConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type UptimeKumaStatusConfig = z.infer<typeof uptimeKumaStatusConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const uptimeKumaStatusDefaultConfig: UptimeKumaStatusConfig = {
  integrationId: UPTIME_KUMA_STATUS_UNSET_INTEGRATION_ID,
};

export type UptimeKumaStatusDraftConfig = {
  integrationId: string;
};

export const uptimeKumaStatusDraftConfig: UptimeKumaStatusDraftConfig = {
  integrationId: "",
};

export const uptimeKumaStatusContract: WidgetContract<UptimeKumaStatusConfig> = {
  id: "uptime-kuma-status",
  version: 1,
  name: "Statut Uptime Kuma",
  description: "Affiche le nombre de moniteurs Uptime Kuma en ligne, hors ligne et en maintenance.",
  category: "monitoring",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: uptimeKumaStatusDefaultConfig,
  configSchema: uptimeKumaStatusConfigSchema,
  publicSafe: false,
};

export type UptimeKumaStatusView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      monitorCount: number;
      upCount: number;
      downCount: number;
      pendingCount: number;
      maintenanceCount: number;
      truncated: boolean;
      latencyMs: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
