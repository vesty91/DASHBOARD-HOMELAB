import { z } from "zod";
import type { WidgetContract } from "./types";

export const appTileConfigSchema = z.object({
  appId: z.uuid(),
  showStatus: z.boolean().default(true),
  showLatency: z.boolean().default(false),
});

export type AppTileConfig = z.infer<typeof appTileConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const APP_TILE_UNSET_APP_ID = "00000000-0000-4000-8000-000000000000";

export const appTileDefaultConfig: AppTileConfig = {
  appId: APP_TILE_UNSET_APP_ID,
  showStatus: true,
  showLatency: false,
};

export type AppTileDraftConfig = {
  appId: string;
  showStatus: boolean;
  showLatency: boolean;
};

export const appTileDraftConfig: AppTileDraftConfig = {
  appId: "",
  showStatus: true,
  showLatency: false,
};

export const appTileContract: WidgetContract<AppTileConfig> = {
  id: "app-tile",
  version: 1,
  name: "Tuile d'application",
  description: "Affiche une App du catalogue avec son statut de santé persisté.",
  category: "apps",
  defaultSize: { w: 2, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 4, h: 4 },
  defaultConfig: appTileDefaultConfig,
  configSchema: appTileConfigSchema,
  publicSafe: false,
};

export interface AppTileData {
  id: string;
  name: string;
  url: string;
  iconRef: string | null;
  color: string | null;
  target: "same-tab" | "new-tab";
  healthcheckEnabled: boolean;
  healthStatus: "unknown" | "up" | "down" | "timeout" | "error";
  lastCheckedAt: string | null;
  lastLatencyMs: number | null;
  lastHttpStatus: number | null;
}

export type AppTileView =
  | { status: "ready"; app: AppTileData }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" };
