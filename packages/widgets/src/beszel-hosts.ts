import { z } from "zod";
import type { WidgetContract } from "./types";

export const beszelHostsConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type BeszelHostsConfig = z.infer<typeof beszelHostsConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const BESZEL_HOSTS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const beszelHostsDefaultConfig: BeszelHostsConfig = {
  integrationId: BESZEL_HOSTS_UNSET_INTEGRATION_ID,
};

export type BeszelHostsDraftConfig = {
  integrationId: string;
};

export const beszelHostsDraftConfig: BeszelHostsDraftConfig = {
  integrationId: "",
};

export const beszelHostsContract: WidgetContract<BeszelHostsConfig> = {
  id: "beszel-hosts",
  version: 1,
  name: "Hôtes Beszel",
  description: "Affiche le nombre d'hôtes Beszel en ligne et les usages CPU, RAM et disque.",
  category: "monitoring",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: beszelHostsDefaultConfig,
  configSchema: beszelHostsConfigSchema,
  publicSafe: false,
};

export type BeszelHostsView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      hostCount: number;
      upCount: number;
      downCount: number;
      pausedCount: number;
      pendingCount: number;
      truncated: boolean;
      cpuPercent: number | null;
      memoryPercent: number | null;
      diskPercent: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
