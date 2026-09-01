import type { IntegrationRateLimiter } from "@dashboard/integrations";

export const SYNOLOGY_REFRESH_RATE_LIMIT = 10;
export const SYNOLOGY_REFRESH_RATE_WINDOW_MS = 60_000;
export const SYNOLOGY_REFRESH_MAX_TRACKED_KEYS = 10_000;

export class MemorySynologyRefreshRateLimiter implements IntegrationRateLimiter {
  readonly #hits = new Map<string, number[]>();
  readonly #maxTrackedKeys: number;

  constructor(
    readonly limit = SYNOLOGY_REFRESH_RATE_LIMIT,
    readonly windowMs = SYNOLOGY_REFRESH_RATE_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
    maxTrackedKeys = SYNOLOGY_REFRESH_MAX_TRACKED_KEYS,
  ) {
    this.#maxTrackedKeys = Math.max(1, maxTrackedKeys);
  }

  tryConsume(actorId: string, integrationId: string): boolean {
    const key = `${actorId}:${integrationId}`;
    const current = this.now();
    this.#pruneExpired(current);
    const recent = (this.#hits.get(key) ?? []).filter((stamp) => stamp > current - this.windowMs);
    if (recent.length >= this.limit) {
      if (recent.length > 0) this.#hits.set(key, recent);
      else this.#hits.delete(key);
      return false;
    }
    if (!this.#hits.has(key)) this.#evictOldestWhileFull();
    recent.push(current);
    this.#hits.set(key, recent);
    return true;
  }

  #pruneExpired(current: number): void {
    for (const [tracked, stamps] of this.#hits)
      if (stamps.every((stamp) => stamp <= current - this.windowMs)) this.#hits.delete(tracked);
  }

  #evictOldestWhileFull(): void {
    while (this.#hits.size >= this.#maxTrackedKeys) {
      const oldest = this.#hits.keys().next().value;
      if (oldest === undefined) return;
      this.#hits.delete(oldest);
    }
  }
}
