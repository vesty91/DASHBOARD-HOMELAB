import type { AppTileView } from "@dashboard/widgets";
import type { ItemRecord, LayoutRecord, PlacementRecord } from "@dashboard/boards";
import { WidgetRenderer } from "@dashboard/widgets/runtime";

export function BoardReadGrid({
  layout,
  items,
  placements,
  appViews,
}: {
  layout: LayoutRecord;
  items: ItemRecord[];
  placements: PlacementRecord[];
  appViews: Record<string, AppTileView>;
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
              />
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
