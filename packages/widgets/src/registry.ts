import { assertWidgetContract } from "./definition";
import type { WidgetContract } from "./types";

export class WidgetRegistry {
  readonly #definitions = new Map<string, WidgetContract>();
  #frozen = false;

  register(definition: WidgetContract): this {
    if (this.#frozen) throw new Error("Built-in widget registry is immutable");
    assertWidgetContract(definition);
    if (this.#definitions.has(definition.id))
      throw new Error(`Duplicate widget id: ${definition.id}`);
    this.#definitions.set(definition.id, definition);
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
    return [...this.#definitions.values()].sort((left, right) => left.id.localeCompare(right.id));
  }
}

export function createWidgetRegistry(): WidgetRegistry {
  return new WidgetRegistry();
}
