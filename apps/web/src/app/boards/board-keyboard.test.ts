import { describe, expect, it } from "vitest";
import {
  describeKeyboardPlacement,
  keyboardHint,
  nextKeyboardPlacement,
  placementsEqual,
} from "./board-keyboard";

const bounds = { columns: 12, minW: 2, minH: 1, maxW: 8, maxH: 4 };
const clock = { x: 0, y: 0, w: 4, h: 2 };

describe("nextKeyboardPlacement", () => {
  it("moves one column or row at a time", () => {
    expect(nextKeyboardPlacement(clock, bounds, "move", "ArrowRight")).toEqual({
      x: 1,
      y: 0,
      w: 4,
      h: 2,
    });
    expect(nextKeyboardPlacement(clock, bounds, "move", "ArrowDown")).toEqual({
      x: 0,
      y: 1,
      w: 4,
      h: 2,
    });
  });

  it("clamps moves to the board edges", () => {
    expect(nextKeyboardPlacement(clock, bounds, "move", "ArrowLeft")).toBeNull();
    expect(nextKeyboardPlacement(clock, bounds, "move", "ArrowUp")).toBeNull();
    expect(
      nextKeyboardPlacement({ x: 8, y: 0, w: 4, h: 2 }, bounds, "move", "ArrowRight"),
    ).toBeNull();
  });

  it("resizes within widget min/max and remaining columns", () => {
    expect(nextKeyboardPlacement(clock, bounds, "resize", "ArrowRight")).toEqual({
      x: 0,
      y: 0,
      w: 5,
      h: 2,
    });
    expect(nextKeyboardPlacement(clock, bounds, "resize", "ArrowLeft")).toEqual({
      x: 0,
      y: 0,
      w: 3,
      h: 2,
    });
    expect(nextKeyboardPlacement(clock, bounds, "resize", "ArrowDown")).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 3,
    });
    expect(nextKeyboardPlacement(clock, bounds, "resize", "ArrowUp")).toEqual({
      x: 0,
      y: 0,
      w: 4,
      h: 1,
    });
  });

  it("refuses a resize that would exceed remaining columns", () => {
    expect(
      nextKeyboardPlacement({ x: 10, y: 0, w: 2, h: 2 }, bounds, "resize", "ArrowRight"),
    ).toBeNull();
  });
});

describe("keyboard announcements", () => {
  it("uses 1-based columns and rows for move announcements", () => {
    expect(describeKeyboardPlacement({ x: 1, y: 2, w: 4, h: 2 }, "move")).toBe(
      "Widget déplacé colonne 2 ligne 3",
    );
  });

  it("describes resize by width and height", () => {
    expect(describeKeyboardPlacement({ x: 0, y: 0, w: 5, h: 3 }, "resize")).toBe(
      "Widget redimensionné largeur 5 hauteur 3",
    );
  });

  it("explains the current keyboard mode", () => {
    expect(keyboardHint(null, false)).toMatch(/Tabulation/);
    expect(keyboardHint(null, true)).toMatch(/Widget sélectionné/);
    expect(keyboardHint("move", true)).toMatch(/Mode déplacement/);
    expect(keyboardHint("resize", true)).toMatch(/Mode redimensionnement/);
  });

  it("compares placements by geometry", () => {
    expect(placementsEqual(clock, { ...clock })).toBe(true);
    expect(placementsEqual(clock, { ...clock, x: 1 })).toBe(false);
  });
});
