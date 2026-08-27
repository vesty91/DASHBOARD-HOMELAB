"use client";
import type { AppTileDraftConfig } from "../app-tile";
import type { ClockConfig } from "../clock";
import { AppTileForm, type AppOption } from "./app-tile-form";
import { BookmarksForm, type BookmarksDraftConfig } from "./bookmarks-form";
import { ClockForm } from "./clock-form";

export function WidgetConfigForm({
  widgetType,
  config,
  onChange,
  permissionDenied,
  loadApps,
}: {
  widgetType: string;
  config: unknown;
  onChange: (config: unknown) => void;
  permissionDenied?: boolean;
  loadApps?: (cursor?: string) => Promise<{ items: AppOption[]; nextCursor: string | null }>;
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
    default:
      return <p role="status">Widget inconnu</p>;
  }
}
