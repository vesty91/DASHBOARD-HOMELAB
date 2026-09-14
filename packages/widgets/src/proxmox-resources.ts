import { z } from "zod";
import type { WidgetContract } from "./types";

export const proxmoxResourcesConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type ProxmoxResourcesConfig = z.infer<typeof proxmoxResourcesConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const PROXMOX_RESOURCES_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const proxmoxResourcesDefaultConfig: ProxmoxResourcesConfig = {
  integrationId: PROXMOX_RESOURCES_UNSET_INTEGRATION_ID,
};

export type ProxmoxResourcesDraftConfig = {
  integrationId: string;
};

export const proxmoxResourcesDraftConfig: ProxmoxResourcesDraftConfig = {
  integrationId: "",
};

export const proxmoxResourcesContract: WidgetContract<ProxmoxResourcesConfig> = {
  id: "proxmox-resources",
  version: 1,
  name: "Ressources Proxmox",
  description: "Synthèse des nœuds, VMs, CTs et mémoire Proxmox VE.",
  category: "infrastructure",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: proxmoxResourcesDefaultConfig,
  configSchema: proxmoxResourcesConfigSchema,
  publicSafe: false,
};

export type ProxmoxResourcesView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      nodeCount: number;
      onlineNodeCount: number;
      vmRunning: number;
      vmCount: number;
      lxcRunning: number;
      lxcCount: number;
      cpuRatio: number | null;
      memoryUsedBytes: number | null;
      memoryTotalBytes: number | null;
      truncated: boolean;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
