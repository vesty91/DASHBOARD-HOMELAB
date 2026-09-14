import type {
  AppTileView,
  BeszelHostsView,
  ImmichStatsView,
  JellyfinSessionsView,
  PrometheusMetricView,
  ServiceStatusView,
  UptimeKumaStatusView,
  GrafanaStatusView,
  NtfyStatusView,
  ProxmoxResourcesView,
} from "@dashboard/widgets";
import type { ItemRecord, LayoutRecord, PlacementRecord } from "@dashboard/boards";
import { WidgetRenderer } from "@dashboard/widgets/runtime";

export function BoardReadGrid({
  layout,
  items,
  placements,
  appViews,
  jellyfinViews = {},
  immichViews = {},
  beszelViews = {},
  prometheusViews = {},
  uptimeKumaViews = {},
  proxmoxViews = {},
  grafanaViews = {},
  ntfyViews = {},
  serviceStatusViews = {},
}: {
  layout: LayoutRecord;
  items: ItemRecord[];
  placements: PlacementRecord[];
  appViews: Record<string, AppTileView>;
  jellyfinViews?: Record<string, JellyfinSessionsView>;
  immichViews?: Record<string, ImmichStatsView>;
  beszelViews?: Record<string, BeszelHostsView>;
  prometheusViews?: Record<string, PrometheusMetricView>;
  uptimeKumaViews?: Record<string, UptimeKumaStatusView>;
  proxmoxViews?: Record<string, ProxmoxResourcesView>;
  grafanaViews?: Record<string, GrafanaStatusView>;
  ntfyViews?: Record<string, NtfyStatusView>;
  serviceStatusViews?: Record<string, ServiceStatusView>;
}) {
  return (
    <section
      className="board-read-grid"
      data-breakpoint={layout.breakpoint}
      style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
      aria-label={`${layout.name} layout`}
    >
      {placements.map((placement) => {
        const entry = items.find((item) => item.id === placement.itemId);
        return (
          <div
            key={placement.id}
            data-item-id={placement.itemId}
            data-x={placement.x}
            data-y={placement.y}
            style={{
              gridColumn: `${placement.x + 1} / span ${placement.w}`,
              gridRow: `${placement.y + 1} / span ${placement.h}`,
            }}
          >
            {entry ? (
              <WidgetRenderer
                item={entry}
                {...(appViews[entry.id] ? { appView: appViews[entry.id] } : {})}
                {...(jellyfinViews[entry.id] ? { jellyfinView: jellyfinViews[entry.id] } : {})}
                {...(immichViews[entry.id] ? { immichView: immichViews[entry.id] } : {})}
                {...(beszelViews[entry.id] ? { beszelView: beszelViews[entry.id] } : {})}
                {...(prometheusViews[entry.id]
                  ? { prometheusView: prometheusViews[entry.id] }
                  : {})}
                {...(serviceStatusViews[entry.id]
                  ? { serviceStatusView: serviceStatusViews[entry.id] }
                  : {})}
                {...(uptimeKumaViews[entry.id]
                  ? { uptimeKumaView: uptimeKumaViews[entry.id] }
                  : {})}
                {...(proxmoxViews[entry.id] ? { proxmoxView: proxmoxViews[entry.id] } : {})}
                {...(grafanaViews[entry.id] ? { grafanaView: grafanaViews[entry.id] } : {})}
                {...(ntfyViews[entry.id] ? { ntfyView: ntfyViews[entry.id] } : {})}
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
