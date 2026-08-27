import { BoardError } from "./errors";
import type { LayoutPlacementInput, WidgetSizing } from "./types";

export const DEFAULT_BOARD_LAYOUTS = [
  { name: "Desktop", breakpoint: "desktop", columns: 12, rowHeight: 72, sortOrder: 0 },
  { name: "Mobile", breakpoint: "mobile", columns: 4, rowHeight: 72, sortOrder: 1 },
] as const;
export const BOARD_AUTOSAVE_DEBOUNCE_MS = 400;

function overlaps(a: LayoutPlacementInput, b: LayoutPlacementInput): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clampWidgetSize(
  sizing: WidgetSizing,
  columns: number,
): { w: number; h: number; minW: number; minH: number; maxW: number; maxH: number } {
  const maxW = Math.min(sizing.maxSize.w, columns);
  const minW = Math.min(sizing.minSize.w, maxW);
  const w = Math.min(Math.max(sizing.defaultSize.w, minW), maxW);
  const h = Math.min(Math.max(sizing.defaultSize.h, sizing.minSize.h), sizing.maxSize.h);
  return { w, h, minW, minH: sizing.minSize.h, maxW, maxH: sizing.maxSize.h };
}

export function findFirstFitPlacement(input: {
  columns: number;
  size: { w: number; h: number };
  existing: readonly LayoutPlacementInput[];
  itemId: string;
}): { x: number; y: number; w: number; h: number } {
  const w = Math.min(input.size.w, input.columns);
  const h = input.size.h;
  for (let y = 0; y <= 10000; y += 1) {
    for (let x = 0; x <= input.columns - w; x += 1) {
      const candidate: LayoutPlacementInput = { itemId: input.itemId, x, y, w, h };
      if (!input.existing.some((entry) => overlaps(entry, candidate)))
        return { x: candidate.x, y: candidate.y, w: candidate.w, h: candidate.h };
    }
  }
  throw new BoardError("VALIDATION_ERROR", "No free placement on layout");
}

export function validateLayoutPlacements(input: {
  columns: number;
  placements: readonly LayoutPlacementInput[];
  constraints?: ReadonlyMap<
    string,
    { minW: number | null; minH: number | null; maxW: number | null; maxH: number | null }
  >;
}): void {
  const ids = new Set<string>();
  for (const p of input.placements) {
    if (ids.has(p.itemId)) throw new BoardError("VALIDATION_ERROR", "Duplicate item placement");
    ids.add(p.itemId);
    const bounds = input.constraints?.get(p.itemId);
    if (
      ![p.x, p.y, p.w, p.h].every(Number.isInteger) ||
      p.x < 0 ||
      p.y < 0 ||
      p.w <= 0 ||
      p.h <= 0 ||
      p.x + p.w > input.columns ||
      p.y > 10000 ||
      p.h > 1000 ||
      (bounds?.minW != null && p.w < bounds.minW) ||
      (bounds?.minH != null && p.h < bounds.minH) ||
      (bounds?.maxW != null && p.w > bounds.maxW) ||
      (bounds?.maxH != null && p.h > bounds.maxH)
    )
      throw new BoardError("VALIDATION_ERROR", "Invalid layout geometry");
  }
  for (let a = 0; a < input.placements.length; a++)
    for (let b = a + 1; b < input.placements.length; b++)
      if (overlaps(input.placements[a]!, input.placements[b]!))
        throw new BoardError("VALIDATION_ERROR", "Layout placements collide");
}
