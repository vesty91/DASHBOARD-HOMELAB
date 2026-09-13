import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { JellyfinOverview } from "@dashboard/jellyfin";
import {
  JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID,
  type JellyfinSessionsView,
} from "@dashboard/widgets";

export interface JellyfinBoardCaller {
  jellyfin: {
    overview: {
      get: (input: { integrationId: string }) => Promise<JellyfinOverview>;
    };
  };
}

function asConfig(config: unknown): { integrationId: string } | null {
  if (!config || typeof config !== "object" || !("integrationId" in config)) return null;
  const integrationId = (config as { integrationId: unknown }).integrationId;
  return typeof integrationId === "string" ? { integrationId } : null;
}

function toView(overview: JellyfinOverview): Extract<JellyfinSessionsView, { status: "ready" }> {
  const sessions = overview.sessions.data?.sessions ?? [];
  return {
    status: "ready",
    serverName: overview.server.data?.serverName ?? null,
    version: overview.server.data?.version ?? null,
    overviewStatus: overview.status,
    fetchedAt: overview.fetchedAt,
    activeCount: overview.sessions.data?.activeCount ?? 0,
    sessions: sessions.map((session) => ({
      id: session.id,
      userLabel: session.userLabel,
      client: session.client,
      deviceName: session.deviceName,
      paused: session.paused,
      nowPlayingName: session.nowPlaying?.name ?? null,
      playbackMode: session.playbackMode,
      transcodeProgressPercent: session.transcoding?.progressPercent ?? null,
    })),
  };
}

export async function resolveJellyfinSessionViews(
  snapshot: BoardSnapshot,
  caller: JellyfinBoardCaller,
): Promise<Record<string, JellyfinSessionsView>> {
  const views: Record<string, JellyfinSessionsView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "jellyfin-sessions" || item.runtimeStatus !== "ready") continue;
    const config = asConfig(item.config);
    if (!config || config.integrationId === JELLYFIN_SESSIONS_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      views[item.id] = toView(
        await caller.jellyfin.overview.get({ integrationId: config.integrationId }),
      );
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
