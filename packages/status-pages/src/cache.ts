export interface PublicStatusCacheEntry<T> {
  value: T;
  expiresAt: number;
}

export function createPublicStatusCache<T>(ttlMs: number) {
  const entries = new Map<string, PublicStatusCacheEntry<T>>();
  return {
    get(key: string, now = Date.now()): T | null {
      const found = entries.get(key);
      if (!found) return null;
      if (found.expiresAt <= now) {
        entries.delete(key);
        return null;
      }
      return found.value;
    },
    set(key: string, value: T, now = Date.now()): void {
      entries.set(key, { value, expiresAt: now + ttlMs });
    },
    invalidate(key: string): void {
      entries.delete(key);
    },
    clear(): void {
      entries.clear();
    },
  };
}

export type PublicStatusCache<T> = ReturnType<typeof createPublicStatusCache<T>>;
