export interface ProxmoxRefreshFence {
  current(integrationId: string): number;
  advance(integrationId: string): number;
}

export const PROXMOX_REFRESH_FENCE_MAX_ENTRIES = 10_000;

export class MemoryProxmoxRefreshFence implements ProxmoxRefreshFence {
  readonly #generations = new Map<string, number>();
  readonly #maxEntries: number;

  constructor(maxEntries = PROXMOX_REFRESH_FENCE_MAX_ENTRIES) {
    this.#maxEntries = Math.max(1, maxEntries);
  }

  current(integrationId: string): number {
    return this.#generations.get(integrationId) ?? 0;
  }

  advance(integrationId: string): number {
    const next = this.current(integrationId) + 1;
    const generation = Number.isSafeInteger(next) && next > 0 ? next : 1;
    if (this.#generations.has(integrationId)) this.#generations.delete(integrationId);
    else this.#evictOldestWhileFull();
    this.#generations.set(integrationId, generation);
    return generation;
  }

  #evictOldestWhileFull(): void {
    while (this.#generations.size >= this.#maxEntries) {
      const oldest = this.#generations.keys().next().value;
      if (oldest === undefined) return;
      this.#generations.delete(oldest);
    }
  }
}
