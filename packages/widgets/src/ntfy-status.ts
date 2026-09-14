import { z } from "zod";
import type { WidgetContract } from "./types";

export const ntfyStatusConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type NtfyStatusConfig = z.infer<typeof ntfyStatusConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const NTFY_STATUS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const ntfyStatusDefaultConfig: NtfyStatusConfig = {
  integrationId: NTFY_STATUS_UNSET_INTEGRATION_ID,
};

export type NtfyStatusDraftConfig = {
  integrationId: string;
};

export const ntfyStatusDraftConfig: NtfyStatusDraftConfig = {
  integrationId: "",
};

export const ntfyStatusContract: WidgetContract<NtfyStatusConfig> = {
  id: "ntfy-status",
  version: 1,
  name: "Statut ntfy",
  description: "Santé, compteurs publics et version ntfy en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: ntfyStatusDefaultConfig,
  configSchema: ntfyStatusConfigSchema,
  publicSafe: false,
};

export type NtfyStatusView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      healthy: boolean | null;
      version: string | null;
      messages: number | null;
      messagesRate: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
