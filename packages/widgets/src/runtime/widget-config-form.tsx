"use client";
import type { AppTileDraftConfig } from "../app-tile";
import type { ClockConfig } from "../clock";
import type { ImmichStatsDraftConfig } from "../immich-stats";
import type { JellyfinSessionsDraftConfig } from "../jellyfin-sessions";
import { AppTileForm, type AppOption } from "./app-tile-form";
import { BookmarksForm, type BookmarksDraftConfig } from "./bookmarks-form";
import { ClockForm } from "./clock-form";
import { ImmichStatsForm, type ImmichIntegrationOption } from "./immich-stats-form";
import { JellyfinSessionsForm, type JellyfinIntegrationOption } from "./jellyfin-sessions-form";

export function WidgetConfigForm({
  widgetType,
  config,
  onChange,
  permissionDenied,
  loadApps,
  jellyfinIntegrations,
  immichIntegrations,
}: {
  widgetType: string;
  config: unknown;
  onChange: (config: unknown) => void;
  permissionDenied?: boolean;
  loadApps?: (cursor?: string) => Promise<{ items: AppOption[]; nextCursor: string | null }>;
  jellyfinIntegrations?: readonly JellyfinIntegrationOption[];
  immichIntegrations?: readonly ImmichIntegrationOption[];
}) {
  switch (widgetType) {
    case "clock":
      return <ClockForm config={config as ClockConfig} onChange={onChange} />;
    case "bookmarks":
      return <BookmarksForm config={config as BookmarksDraftConfig} onChange={onChange} />;
    case "app-tile":
      if (!loadApps) return <p role="status">Permission insuffisante</p>;
      return (
        <AppTileForm
          config={config as AppTileDraftConfig}
          onChange={onChange}
          {...(permissionDenied ? { permissionDenied: true } : {})}
          loadApps={loadApps}
        />
      );
    case "jellyfin-sessions":
      return (
        <JellyfinSessionsForm
          config={config as JellyfinSessionsDraftConfig}
          onChange={onChange}
          integrations={jellyfinIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    case "immich-stats":
      return (
        <ImmichStatsForm
          config={config as ImmichStatsDraftConfig}
          onChange={onChange}
          integrations={immichIntegrations ?? []}
          {...(permissionDenied ? { permissionDenied: true } : {})}
        />
      );
    default:
      return <p role="status">Widget inconnu</p>;
  }
}
