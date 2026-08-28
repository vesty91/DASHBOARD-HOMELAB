import { catalogEntryFromDefinition, sealIntegrationDefinition } from "./definition";
import { IntegrationError } from "./errors";
import type { IntegrationCatalogEntry, IntegrationDefinition } from "./types";

export class IntegrationRegistry {
  readonly #definitions = new Map<string, IntegrationDefinition>();
  #frozen = false;

  register(definition: IntegrationDefinition): this {
    if (this.#frozen) throw new IntegrationError("MISCONFIGURED", "Integration registry is frozen");
    const sealed = sealIntegrationDefinition(definition);
    if (this.#definitions.has(sealed.id))
      throw new IntegrationError("MISCONFIGURED", `Duplicate integration id: ${sealed.id}`);
    this.#definitions.set(sealed.id, sealed);
    return this;
  }

  freeze(): this {
    this.#frozen = true;
    return this;
  }

  get(id: string): IntegrationDefinition | undefined {
    return this.#definitions.get(id);
  }

  has(id: string): boolean {
    return this.#definitions.has(id);
  }

  list(): readonly IntegrationDefinition[] {
    return Object.freeze(
      [...this.#definitions.values()].sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  catalog(): readonly IntegrationCatalogEntry[] {
    return Object.freeze(this.list().map((definition) => catalogEntryFromDefinition(definition)));
  }
}

export function createIntegrationRegistry(): IntegrationRegistry {
  return new IntegrationRegistry();
}

export function createProductionIntegrationRegistry(): IntegrationRegistry {
  return createIntegrationRegistry().freeze();
}
