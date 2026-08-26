import { BoardError } from "./errors";
import type { LayoutPlacementInput } from "./types";
export const DEFAULT_BOARD_LAYOUTS = [
  { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 72, sortOrder: 0 },
  { name: "Mobile", breakpoint: "mobile", columns: 4, rowHeight: 72, sortOrder: 1 },
] as const;
export const BOARD_AUTOSAVE_DEBOUNCE_MS = 400;
function overlaps(a: LayoutPlacementInput, b: LayoutPlacementInput): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function validateLayoutPlacements(input: {
  columns: number;
  placements: readonly LayoutPlacementInput[];
}): void {
  const ids = new Set<string>();
  for (const p of input.placements) {
    if (ids.has(p.itemId)) throw new BoardError("VALIDATION_ERROR", "Duplicate item placement");
    ids.add(p.itemId);
    if (
      ![p.x, p.y, p.w, p.h].every(Number.isInteger) ||
      p.x < 0 ||
      p.y < 0 ||
      p.w <= 0 ||
      p.h <= 0 ||
      p.x + p.w > input.columns ||
      p.y > 10000 ||
      p.h > 1000
    )
      throw new BoardError("VALIDATION_ERROR", "Invalid layout geometry");
  }
  for (let a = 0; a < input.placements.length; a++)
    for (let b = a + 1; b < input.placements.length; b++)
      if (overlaps(input.placements[a]!, input.placements[b]!))
        throw new BoardError("VALIDATION_ERROR", "Layout placements collide");
}
