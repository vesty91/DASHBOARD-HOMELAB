import { describe, expect, it } from "vitest";
import { createInMemoryActionRateLimiter, integrationActionRateKey } from "./action-limiter";

describe("sensitive action rate limiter", () => {
  it("allows a burst then denies until the window elapses", () => {
    const limiter = createInMemoryActionRateLimiter(2, 1_000);
    expect(limiter.tryConsume("backup.restore", 1_000)).toBe(true);
    expect(limiter.tryConsume("backup.restore", 1_100)).toBe(true);
    expect(limiter.tryConsume("backup.restore", 1_200)).toBe(false);
    expect(limiter.tryConsume("backup.restore", 2_100)).toBe(true);
  });

  it("scopes integration actions by actor, integration and action", () => {
    const limiter = createInMemoryActionRateLimiter(1, 60_000);
    const start = integrationActionRateKey("user-1", "int-1", "proxmox.start");
    const otherAction = integrationActionRateKey("user-1", "int-1", "proxmox.reboot");
    expect(limiter.tryConsume(start, 1_000)).toBe(true);
    expect(limiter.tryConsume(start, 1_001)).toBe(false);
    expect(limiter.tryConsume(otherAction, 1_002)).toBe(true);
  });
});
