export interface LoginAttemptProtection {
  consume(key: string): boolean;
  reset(key: string): void;
}
export function createInMemoryLoginAttemptProtection(
  limit = 5,
  windowMs = 60_000,
): LoginAttemptProtection {
  const attempts = new Map<string, { count: number; expiresAt: number }>();
  return {
    consume(key) {
      const now = Date.now(),
        current = attempts.get(key);
      if (!current || current.expiresAt <= now) {
        attempts.set(key, { count: 1, expiresAt: now + windowMs });
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
