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
});
