import { compareAppDefinitions, validateReplacementGraph } from "./lifecycle";
import { appDefinitionSchema } from "./schema";
import type { AppDefinition, AppLibraryCategory } from "./types";

function freezeJsonValue<T>(value: T): T {
  if (Array.isArray(value)) return Object.freeze(value.map((entry) => freezeJsonValue(entry))) as T;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) copy[key] = freezeJsonValue(entry);
    }
    return Object.freeze(copy) as T;
  }
  return value;
}

function seal(definition: AppDefinition): AppDefinition {
  return freezeJsonValue(appDefinitionSchema.parse(definition)) as AppDefinition;
}

function normalizeQuery(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("und");
}

export class AppLibraryRegistry {
  readonly #definitions = new Map<string, AppDefinition>();
  #frozen = false;

  register(definition: AppDefinition): this {
    if (this.#frozen) throw new Error("Built-in app library is immutable");
    const sealed = seal(definition);
    if (this.#definitions.has(sealed.id))
      throw new Error(`Duplicate app definition id: ${sealed.id}`);
    this.#definitions.set(sealed.id, sealed);
    return this;
  }

  freeze(): this {
    validateReplacementGraph(this.#definitions);
    this.#frozen = true;
    return this;
  }

  get(id: string): AppDefinition | undefined {
    return this.#definitions.get(id);
  }

  has(id: string): boolean {
    return this.#definitions.has(id);
  }

  list(): readonly AppDefinition[] {
    return Object.freeze([...this.#definitions.values()].sort(compareAppDefinitions));
  }

  search(query: string): readonly AppDefinition[] {
    const needle = normalizeQuery(query);
    if (!needle) return this.list();
    return Object.freeze(
      this.list().filter((definition) => {
        if (normalizeQuery(definition.id).includes(needle)) return true;
        if (normalizeQuery(definition.name).includes(needle)) return true;
        if (normalizeQuery(definition.description).includes(needle)) return true;
        if (definition.tags.some((tag) => tag.includes(needle) || needle.includes(tag)))
          return true;
        const replacedBy = definition.lifecycle?.replacedBy;
        if (!replacedBy) return false;
        if (normalizeQuery(replacedBy).includes(needle)) return true;
        const target = this.#definitions.get(replacedBy);
        return Boolean(target && normalizeQuery(target.name).includes(needle));
      }),
    );
  }

  byCategory(category: AppLibraryCategory): readonly AppDefinition[] {
    return Object.freeze(this.list().filter((definition) => definition.category === category));
  }
}

export function createAppLibraryRegistry(): AppLibraryRegistry {
  return new AppLibraryRegistry();
}
