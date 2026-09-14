export function createInMemoryActionRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return {
    tryConsume(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

export type ActionRateLimiter = ReturnType<typeof createInMemoryActionRateLimiter>;
