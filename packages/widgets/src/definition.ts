import type { WidgetContract, WidgetSize } from "./types";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function assertSize(label: string, size: WidgetSize): void {
  if (!Number.isInteger(size.w) || !Number.isInteger(size.h) || size.w < 1 || size.h < 1)
    throw new Error(`${label} must be positive integers`);
}

function assertOrdered(min: WidgetSize, value: WidgetSize, max: WidgetSize, axis: "w" | "h"): void {
  if (min[axis] > value[axis] || value[axis] > max[axis])
    throw new Error(`Widget size must satisfy min.${axis} <= default.${axis} <= max.${axis}`);
}

export function assertWidgetContract(definition: WidgetContract): void {
  if (!idPattern.test(definition.id)) throw new Error("Widget id must be a stable lowercase slug");
  if (!Number.isInteger(definition.version) || definition.version < 1)
    throw new Error("Widget version must be an integer >= 1");
  if (!definition.name.trim()) throw new Error("Widget name is required");
  if (!definition.description.trim()) throw new Error("Widget description is required");
  if (!definition.category.trim()) throw new Error("Widget category is required");
  assertSize("defaultSize", definition.defaultSize);
  assertSize("minSize", definition.minSize);
  assertSize("maxSize", definition.maxSize);
  assertOrdered(definition.minSize, definition.defaultSize, definition.maxSize, "w");
  assertOrdered(definition.minSize, definition.defaultSize, definition.maxSize, "h");
  if (typeof definition.publicSafe !== "boolean") throw new Error("publicSafe must be a boolean");
  const parsed = definition.configSchema.safeParse(definition.defaultConfig);
  if (!parsed.success) throw new Error("Widget defaultConfig must satisfy configSchema");
}
