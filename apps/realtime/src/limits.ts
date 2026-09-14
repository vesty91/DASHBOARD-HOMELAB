export const REALTIME_MAX_CONNECTIONS = 100;
export const REALTIME_MAX_CONNECTIONS_PER_USER = 8;
export const REALTIME_HEARTBEAT_MS = 15_000;
export const REALTIME_MAX_BUFFERED_BYTES = 64_384;
export const REALTIME_MAX_PAYLOAD_BYTES = 8_192;

export class ConnectionLimiter {
  #global = 0;
  readonly #perUser = new Map<string, number>();

  constructor(
    readonly maxGlobal: number,
    readonly maxPerUser: number,
  ) {}

  tryAcquire(userId: string): boolean {
    const userCount = this.#perUser.get(userId) ?? 0;
    if (this.#global >= this.maxGlobal || userCount >= this.maxPerUser) return false;
    this.#global += 1;
    this.#perUser.set(userId, userCount + 1);
    return true;
  }

  release(userId: string): void {
    if (this.#global > 0) this.#global -= 1;
    const userCount = this.#perUser.get(userId);
    if (userCount === undefined) return;
    if (userCount <= 1) this.#perUser.delete(userId);
    else this.#perUser.set(userId, userCount - 1);
  }

  get size(): number {
    return this.#global;
  }

  countFor(userId: string): number {
    return this.#perUser.get(userId) ?? 0;
  }
}

export function shouldCloseSlowConsumer(bufferedAmount: number, maxBufferedBytes: number): boolean {
  return bufferedAmount > maxBufferedBytes;
}
