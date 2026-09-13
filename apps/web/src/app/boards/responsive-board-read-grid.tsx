"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import type {
  AppTileView,
  BeszelHostsView,
  ImmichStatsView,
  JellyfinSessionsView,
  UptimeKumaStatusView,
} from "@dashboard/widgets";
import { BoardReadGrid } from "./board-read-grid";
import { JELLYFIN_BOARD_REFRESH_MS, shouldPollJellyfinBoard } from "./jellyfin-board-refresh";

const MOBILE_QUERY = "(max-width: 767px)";
export function ResponsiveBoardReadGrid({
  snapshot,
  appViews,
  jellyfinViews = {},
  immichViews = {},
  beszelViews = {},
  uptimeKumaViews = {},
}: {
  snapshot: BoardSnapshot;
  appViews: Record<string, AppTileView>;
  jellyfinViews?: Record<string, JellyfinSessionsView>;
  immichViews?: Record<string, ImmichStatsView>;
  beszelViews?: Record<string, BeszelHostsView>;
  uptimeKumaViews?: Record<string, UptimeKumaStatusView>;
}) {
  const router = useRouter();
  const [requested, setRequested] = useState<"desktop" | "mobile">("desktop");
  const pollBoard =
    shouldPollJellyfinBoard(jellyfinViews) ||
    shouldPollJellyfinBoard(immichViews) ||
    shouldPollJellyfinBoard(beszelViews) ||
    shouldPollJellyfinBoard(uptimeKumaViews);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setRequested(media.matches ? "mobile" : "desktop");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!pollBoard) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, JELLYFIN_BOARD_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [pollBoard, router]);
  const layout =
    snapshot.layouts.find((entry) => entry.breakpoint === requested) ??
    snapshot.layouts.find((entry) => entry.breakpoint !== requested) ??
    snapshot.layouts[0];
  if (!layout) return <p>Aucun layout disponible.</p>;
  return (
    <BoardReadGrid
      layout={layout}
      items={snapshot.items}
      placements={snapshot.placements.filter((entry) => entry.layoutId === layout.id)}
      appViews={appViews}
      jellyfinViews={jellyfinViews}
      immichViews={immichViews}
      beszelViews={beszelViews}
      uptimeKumaViews={uptimeKumaViews}
    />
  );
}
