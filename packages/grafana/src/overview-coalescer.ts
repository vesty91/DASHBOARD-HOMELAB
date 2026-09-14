export interface GrafanaOverviewCoalescer {
  run<T>(key: string, factory: () => Promise<T>): Promise<T>;
}

export const GRAFANA_OVERVIEW_COALESCER_MAX_IN_FLIGHT = 1_024;

export class MemoryGrafanaOverviewCoalescer implements GrafanaOverviewCoalescer {
  readonly #inFlight = new Map<string, Promise<unknown>>();
  readonly #maxInFlight: number;

  constructor(maxInFlight = GRAFANA_OVERVIEW_COALESCER_MAX_IN_FLIGHT) {
    this.#maxInFlight = Math.max(1, maxInFlight);
  }

  run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.#inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const created = factory();
    if (this.#inFlight.size >= this.#maxInFlight) return created;
    const tracked: Promise<T> = created.finally(() => {
      if (this.#inFlight.get(key) === tracked) this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, tracked);
    return tracked;
  }
}
