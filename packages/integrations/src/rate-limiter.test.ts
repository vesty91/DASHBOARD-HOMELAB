import { describe, expect, it } from "vitest";
import { MemoryTestRateLimiter } from "./rate-limiter";

describe("MemoryTestRateLimiter", () => {
  it("allows five tests then rejects within the window", () => {
    let now = 1_000;
    const limiter = new MemoryTestRateLimiter(5, 60_000, () => now);
    for (let index = 0; index < 5; index += 1)
      expect(limiter.tryConsume("actor", "integration")).toBe(true);
    expect(limiter.tryConsume("actor", "integration")).toBe(false);
    expect(limiter.tryConsume("other", "integration")).toBe(true);
    now += 60_001;
    expect(limiter.tryConsume("actor", "integration")).toBe(true);
  });

  it("never grows beyond maxTrackedKeys while entries are still active", () => {
    const limiter = new MemoryTestRateLimiter(5, 60_000, () => 1_000, 10);
    for (let index = 0; index < 15; index += 1)
      expect(limiter.tryConsume(`actor-${index}`, "integration")).toBe(true);
    expect(limiter.trackedKeyCount).toBeLessThanOrEqual(10);
    expect(limiter.trackedKeyCount).toBe(10);
  });
});
