import { describe, expect, it } from "vitest";
import { MemorySynologyRefreshFence } from "./refresh-fence";

describe("MemorySynologyRefreshFence", () => {
  it("starts at 0 and advances per integration", () => {
    const fence = new MemorySynologyRefreshFence();
    expect(fence.current("a")).toBe(0);
    expect(fence.advance("a")).toBe(1);
    expect(fence.current("a")).toBe(1);
    expect(fence.advance("a")).toBe(2);
    expect(fence.current("b")).toBe(0);
  });

  it("evicts the oldest unused integration when full", () => {
    const fence = new MemorySynologyRefreshFence(2);
    expect(fence.advance("a")).toBe(1);
    expect(fence.advance("b")).toBe(1);
    expect(fence.advance("c")).toBe(1);
    expect(fence.size).toBe(2);
    expect(fence.current("a")).toBe(0);
    expect(fence.current("b")).toBe(1);
    expect(fence.current("c")).toBe(1);
  });
});
