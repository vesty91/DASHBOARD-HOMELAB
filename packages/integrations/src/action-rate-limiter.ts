export const SAFE_ACTION_RATE_LIMIT = 10;
export const SAFE_ACTION_RATE_WINDOW_MS = 60_000;
export const SAFE_ACTION_MAX_TRACKED_KEYS = 10_000;

export interface SafeActionRateLimiter {
  tryConsume(actorId: string, integrationId: string, action: string): boolean;
}

export interface SafeActionInFlightGuard {
  tryEnter(key: string): boolean;
  leave(key: string): void;
}

export function safeActionRateKey(actorId: string, integrationId: string, action: string): string {
  return `${action}:${integrationId}:${actorId}`;
}

export function safeActionInFlightKey(
  actorId: string,
  integrationId: string,
  action: string,
  resourceId: string,
): string {
  return `${actorId}:${integrationId}:${action}:${resourceId}`;
}

export class MemorySafeActionRateLimiter implements SafeActionRateLimiter {
  readonly #hits = new Map<string, number[]>();
  readonly #maxTrackedKeys: number;

  constructor(
    readonly limit = SAFE_ACTION_RATE_LIMIT,
    readonly windowMs = SAFE_ACTION_RATE_WINDOW_MS,
    private readonly now: () => number = () => Date.now(),
    maxTrackedKeys = SAFE_ACTION_MAX_TRACKED_KEYS,
  ) {
    this.#maxTrackedKeys = Math.max(1, maxTrackedKeys);
  }

  get trackedKeyCount(): number {
    return this.#hits.size;
  }

  tryConsume(actorId: string, integrationId: string, action: string): boolean {
    const key = safeActionRateKey(actorId, integrationId, action);
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

export class MemorySafeActionInFlightGuard implements SafeActionInFlightGuard {
  readonly #inflight = new Set<string>();

  tryEnter(key: string): boolean {
    if (this.#inflight.has(key)) return false;
    this.#inflight.add(key);
    return true;
  }

  leave(key: string): void {
    this.#inflight.delete(key);
  }
}
