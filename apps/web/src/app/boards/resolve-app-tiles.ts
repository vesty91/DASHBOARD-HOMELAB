import { TRPCError } from "@trpc/server";
import type { AppTileView } from "@dashboard/widgets";
import type { BoardSnapshot } from "@dashboard/boards";
import { getBoardCaller } from "../../lib/server/board-api";

type BoardCaller = Awaited<ReturnType<typeof getBoardCaller>>;

function asAppTileConfig(config: unknown): { appId: string } | null {
  if (!config || typeof config !== "object" || !("appId" in config)) return null;
  const appId = (config as { appId: unknown }).appId;
  return typeof appId === "string" ? { appId } : null;
}

export async function resolveAppTileViews(
  snapshot: BoardSnapshot,
  caller: BoardCaller,
): Promise<Record<string, AppTileView>> {
  const views: Record<string, AppTileView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "app-tile" || item.runtimeStatus !== "ready") continue;
    const config = asAppTileConfig(item.config);
    if (!config) {
      views[item.id] = { status: "empty" };
      continue;
    }
    try {
      const app = await caller.app.get({ id: config.appId });
      views[item.id] = {
        status: "ready",
        app: {
          id: app.id,
          name: app.name,
          url: app.url,
          iconRef: app.iconRef,
          color: app.color,
          target: app.target,
          healthcheckEnabled: app.healthcheckEnabled,
          healthStatus: app.healthStatus,
          lastCheckedAt: app.lastCheckedAt ? app.lastCheckedAt.toISOString() : null,
          lastLatencyMs: app.lastLatencyMs,
          lastHttpStatus: app.lastHttpStatus,
        },
      };
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else throw error;
    }
  }
  return views;
}
