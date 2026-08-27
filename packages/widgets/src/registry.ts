import { assertWidgetContract } from "./definition";
import type { WidgetContract, WidgetSize } from "./types";

function freezeSize(size: WidgetSize): Readonly<WidgetSize> {
  return Object.freeze({ w: size.w, h: size.h });
}

function freezeJsonValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezeJsonValue(entry))) as T;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>))
      copy[key] = freezeJsonValue(entry);
    return Object.freeze(copy) as T;
  }
  return value;
}

function sealContract(definition: WidgetContract): WidgetContract {
  const stored: WidgetContract = {
    id: definition.id,
    version: definition.version,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    defaultSize: freezeSize(definition.defaultSize),
    minSize: freezeSize(definition.minSize),
    maxSize: freezeSize(definition.maxSize),
    defaultConfig: freezeJsonValue(definition.defaultConfig),
    configSchema: definition.configSchema,
    publicSafe: definition.publicSafe,
    ...(definition.migrations ? { migrations: Object.freeze({ ...definition.migrations }) } : {}),
  };
  return Object.freeze(stored);
}

export class WidgetRegistry {
  readonly #definitions = new Map<string, WidgetContract>();
  #frozen = false;

  register(definition: WidgetContract): this {
    if (this.#frozen) throw new Error("Built-in widget registry is immutable");
    assertWidgetContract(definition);
    if (this.#definitions.has(definition.id))
      throw new Error(`Duplicate widget id: ${definition.id}`);
    this.#definitions.set(definition.id, sealContract(definition));
    return this;
  }

  freeze(): this {
    this.#frozen = true;
    return this;
  }

  get(id: string): WidgetContract | undefined {
    return this.#definitions.get(id);
  }

  has(id: string): boolean {
    return this.#definitions.has(id);
  }

  list(): readonly WidgetContract[] {
    return Object.freeze(
      [...this.#definitions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    );
  }
}

export function createWidgetRegistry(): WidgetRegistry {
  return new WidgetRegistry();
}
