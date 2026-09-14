import { describe, expect, it } from "vitest";
import { createInMemoryActionRateLimiter } from "./action-limiter";

describe("sensitive action rate limiter", () => {
  it("allows a burst then denies until the window elapses", () => {
    const limiter = createInMemoryActionRateLimiter(2, 1_000);
    expect(limiter.tryConsume("backup.restore", 1_000)).toBe(true);
    expect(limiter.tryConsume("backup.restore", 1_100)).toBe(true);
    expect(limiter.tryConsume("backup.restore", 1_200)).toBe(false);
    expect(limiter.tryConsume("backup.restore", 2_100)).toBe(true);
  });
});
