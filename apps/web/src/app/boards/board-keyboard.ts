export type KeyboardArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";
export type BoardKeyboardMode = "move" | "resize";

export interface KeyboardPlacement {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface KeyboardPlacementBounds {
  columns: number;
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
}

export function isKeyboardArrowKey(key: string): key is KeyboardArrowKey {
  return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown";
}

export function placementsEqual(a: KeyboardPlacement, b: KeyboardPlacement): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function nextKeyboardPlacement(
  current: KeyboardPlacement,
  bounds: KeyboardPlacementBounds,
  mode: BoardKeyboardMode,
  key: KeyboardArrowKey,
): KeyboardPlacement | null {
  const maxW = Math.min(Math.max(bounds.maxW, bounds.minW), bounds.columns);
  const minW = Math.min(Math.max(1, bounds.minW), maxW);
  const minH = Math.max(1, bounds.minH);
  const maxH = Math.max(minH, bounds.maxH);

  let next: KeyboardPlacement;
  switch (mode) {
    case "move": {
      let x = current.x;
      let y = current.y;
      switch (key) {
        case "ArrowLeft":
          x -= 1;
          break;
        case "ArrowRight":
          x += 1;
          break;
        case "ArrowUp":
          y -= 1;
          break;
        case "ArrowDown":
          y += 1;
          break;
        default: {
          const exhaustive: never = key;
          return exhaustive;
        }
      }
      next = {
        x: Math.max(0, Math.min(x, bounds.columns - current.w)),
        y: Math.max(0, y),
        w: current.w,
        h: current.h,
      };
      break;
    }
    case "resize": {
      let w = current.w;
      let h = current.h;
      switch (key) {
        case "ArrowLeft":
          w -= 1;
          break;
        case "ArrowRight":
          w += 1;
          break;
        case "ArrowUp":
          h -= 1;
          break;
        case "ArrowDown":
          h += 1;
          break;
        default: {
          const exhaustive: never = key;
          return exhaustive;
        }
      }
      const nextW = Math.min(Math.max(w, minW), Math.min(maxW, bounds.columns - current.x));
      const nextH = Math.min(Math.max(h, minH), maxH);
      next = { x: current.x, y: current.y, w: nextW, h: nextH };
      break;
    }
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }

  return placementsEqual(current, next) ? null : next;
}

export function describeKeyboardPlacement(
  placement: KeyboardPlacement,
  mode: BoardKeyboardMode,
): string {
  switch (mode) {
    case "move":
      return `Widget déplacé colonne ${placement.x + 1} ligne ${placement.y + 1}`;
    case "resize":
      return `Widget redimensionné largeur ${placement.w} hauteur ${placement.h}`;
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function keyboardHint(mode: BoardKeyboardMode | null, selected: boolean): string {
  if (!selected) {
    return "Tabulation jusqu'à un widget, puis Configurer, Déplacer, Redimensionner ou Supprimer.";
  }
  switch (mode) {
    case "move":
      return "Mode déplacement : flèches pour déplacer, Échap pour quitter.";
    case "resize":
      return "Mode redimensionnement : flèches pour changer la taille, Échap pour quitter.";
    case null:
      return "Widget sélectionné. Utilisez la barre d'actions, m pour déplacer, r pour redimensionner.";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
