import { describe, expect, it } from "vitest";
import {
  MemorySynologyEnrollmentRateLimiter,
  MemorySynologyRefreshRateLimiter,
  SYNOLOGY_ENROLLMENT_MAX_TRACKED_KEYS,
  SYNOLOGY_ENROLLMENT_RATE_LIMIT,
  SYNOLOGY_ENROLLMENT_RATE_WINDOW_MS,
  SYNOLOGY_REFRESH_RATE_LIMIT,
} from "./rate-limiter";

describe("Synology rate limiters", () => {
  it("keeps refresh and enrollment policies independent", () => {
    const refresh = new MemorySynologyRefreshRateLimiter();
    const enrollment = new MemorySynologyEnrollmentRateLimiter();
    expect(refresh.limit).toBe(SYNOLOGY_REFRESH_RATE_LIMIT);
    expect(enrollment.limit).toBe(SYNOLOGY_ENROLLMENT_RATE_LIMIT);
    expect(enrollment.windowMs).toBe(SYNOLOGY_ENROLLMENT_RATE_WINDOW_MS);
    expect(SYNOLOGY_ENROLLMENT_MAX_TRACKED_KEYS).toBe(10_000);
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(enrollment.tryConsume("actor-a", "nas-x")).toBe(true);
    expect(enrollment.tryConsume("actor-a", "nas-x")).toBe(false);
    expect(refresh.tryConsume("actor-a", "nas-x")).toBe(true);
  });

  it("resets enrollment attempts after the window and isolates keys", () => {
    let now = 1_000;
    const limiter = new MemorySynologyEnrollmentRateLimiter(5, 60_000, () => now);
    for (let attempt = 0; attempt < 5; attempt += 1)
      expect(limiter.tryConsume("actor-a", "nas-x")).toBe(true);
    expect(limiter.tryConsume("actor-a", "nas-x")).toBe(false);
    expect(limiter.tryConsume("actor-b", "nas-x")).toBe(true);
    expect(limiter.tryConsume("actor-a", "nas-y")).toBe(true);
    now = 1_000 + 60_001;
    expect(limiter.tryConsume("actor-a", "nas-x")).toBe(true);
  });
});
