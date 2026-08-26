import type { ItemRecord, LayoutRecord, PlacementRecord } from "@dashboard/boards";
export function BoardReadGrid({
  layout,
  items,
  placements,
}: {
  layout: LayoutRecord;
  items: ItemRecord[];
  placements: PlacementRecord[];
}) {
  return (
    <section
      className="board-read-grid"
      style={{ gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))` }}
      aria-label={`${layout.name} layout`}
    >
      {placements.map((p) => {
        const entry = items.find((i) => i.id === p.itemId);
        return (
          <article
            key={p.id}
            style={{ gridColumn: `${p.x + 1} / span ${p.w}`, gridRow: `${p.y + 1} / span ${p.h}` }}
          >
            <h2>{entry?.title ?? entry?.widgetType ?? "Item"}</h2>
            {entry && <p>{entry.widgetType}</p>}
          </article>
        );
      })}
    </section>
  );
}
