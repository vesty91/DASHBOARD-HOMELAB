import type { IntegrationRateLimiter } from "./types";

export const DEFAULT_TEST_RATE_LIMIT = 5;
export const DEFAULT_TEST_RATE_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

export class MemoryTestRateLimiter implements IntegrationRateLimiter {
  readonly #hits = new Map<string, number[]>();

  constructor(
    readonly limit = DEFAULT_TEST_RATE_LIMIT,
    readonly windowMs = DEFAULT_TEST_RATE_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  tryConsume(actorId: string, integrationId: string): boolean {
    const key = `${actorId}:${integrationId}`;
    const current = this.now();
    const recent = (this.#hits.get(key) ?? []).filter((stamp) => stamp > current - this.windowMs);
    if (recent.length >= this.limit) {
      this.#hits.set(key, recent);
      return false;
    }
    recent.push(current);
    this.#hits.set(key, recent);
    if (this.#hits.size > MAX_TRACKED_KEYS) {
      for (const [tracked, stamps] of this.#hits)
        if (stamps.every((stamp) => stamp <= current - this.windowMs)) this.#hits.delete(tracked);
    }
    return true;
  }
}
