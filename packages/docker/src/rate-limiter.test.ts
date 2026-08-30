import { describe, expect, it } from "vitest";
import { MemoryDockerActionRateLimiter } from "./rate-limiter";

describe("Docker action rate limiter", () => {
  it("allows 10 actions then rate-limits until the window expires", () => {
    let now = 1_000;
    const limiter = new MemoryDockerActionRateLimiter(10, 60_000, () => now, 2);
    for (let index = 0; index < 10; index += 1)
      expect(limiter.tryConsume("user-a", "int-a")).toBe(true);
    expect(limiter.tryConsume("user-a", "int-a")).toBe(false);
    now += 60_001;
    expect(limiter.tryConsume("user-a", "int-a")).toBe(true);
    limiter.tryConsume("user-b", "int-b");
    limiter.tryConsume("user-c", "int-c");
    expect(limiter.trackedKeyCount).toBeLessThanOrEqual(2);
  });
});
