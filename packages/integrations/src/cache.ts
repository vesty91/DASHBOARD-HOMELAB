import type { IntegrationCache } from "./types";

export const DEFAULT_CACHE_MAX_ENTRIES = 500;
export const DEFAULT_CACHE_TTL_MS = 30_000;

export class MemoryIntegrationCache implements IntegrationCache {
  readonly #entries = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(
    readonly maxEntries = DEFAULT_CACHE_MAX_ENTRIES,
    readonly defaultTtlMs = DEFAULT_CACHE_TTL_MS,
  ) {}

  #key(integrationId: string, operation: string): string {
    return `${integrationId}\0${operation}`;
  }

  get(integrationId: string, operation: string): unknown {
    const key = this.#key(integrationId, operation);
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(integrationId: string, operation: string, value: unknown, ttlMs = this.defaultTtlMs): void {
    const key = this.#key(integrationId, operation);
    if (this.#entries.has(key)) this.#entries.delete(key);
    this.#entries.set(key, { expiresAt: Date.now() + ttlMs, value });
    while (this.#entries.size > this.maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  invalidate(integrationId: string): void {
    const prefix = `${integrationId}\0`;
    for (const key of [...this.#entries.keys()])
      if (key.startsWith(prefix)) this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }

  get size(): number {
    return this.#entries.size;
  }
}
