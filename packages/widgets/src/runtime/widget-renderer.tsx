"use client";
import type { AppTileConfig, AppTileView } from "../app-tile";
import type { BookmarksConfig } from "../bookmarks";
import type { ClockConfig } from "../clock";
import { builtInWidgetRegistry } from "../built-in";
import type { WidgetItemStatus } from "../types";
import { AppTileWidget } from "./app-tile-widget";
import { BookmarksWidget } from "./bookmarks-widget";
import { ClockWidget } from "./clock-widget";
import { WidgetBoundary } from "./widget-boundary";
import { WidgetFrame } from "./widget-frame";

export interface WidgetItemView {
  id: string;
  widgetType: string;
  widgetVersion: number;
  title: string | null;
  config: unknown | null;
  runtimeStatus: WidgetItemStatus;
}

function titleOf(item: WidgetItemView): string {
  if (item.title?.trim()) return item.title;
  return builtInWidgetRegistry.get(item.widgetType)?.name ?? item.widgetType;
}

function frameForStatus(item: WidgetItemView) {
  const title = titleOf(item);
  switch (item.runtimeStatus) {
    case "ready":
      return null;
    case "unknown":
      return <WidgetFrame title={title} state="error" message="Widget inconnu" />;
    case "incompatible-version":
      return <WidgetFrame title={title} state="error" message="Version de widget incompatible" />;
    case "invalid-config":
    case "configuration-missing":
      return <WidgetFrame title={title} state="configuration-missing" />;
    default: {
      const exhaustive: never = item.runtimeStatus;
      return exhaustive;
    }
  }
}

function ReadyWidget({
  item,
  appView,
}: {
  item: WidgetItemView;
  appView: AppTileView | undefined;
}) {
  switch (item.widgetType) {
    case "clock":
      return <ClockWidget config={item.config as ClockConfig} />;
    case "bookmarks":
      return <BookmarksWidget config={item.config as BookmarksConfig} />;
    case "app-tile":
      return <AppTileWidget config={item.config as AppTileConfig} view={appView} />;
    default:
      return null;
  }
}

export function WidgetRenderer({ item, appView }: { item: WidgetItemView; appView?: AppTileView }) {
  const blocked = frameForStatus(item);
  if (blocked) return blocked;
  return (
    <WidgetBoundary>
      <WidgetFrame title={titleOf(item)} state="ready">
        <ReadyWidget item={item} appView={appView} />
      </WidgetFrame>
    </WidgetBoundary>
  );
}
