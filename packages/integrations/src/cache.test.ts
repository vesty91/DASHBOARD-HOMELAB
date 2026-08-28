import { describe, expect, it } from "vitest";
import { MemoryIntegrationCache } from "./cache";

describe("MemoryIntegrationCache", () => {
  it("expires entries, isolates integrations and evicts the oldest", () => {
    const cache = new MemoryIntegrationCache(2, 20);
    cache.set("a", "info", { v: 1 });
    cache.set("b", "info", { v: 2 });
    expect(cache.get("a", "info")).toEqual({ v: 1 });
    cache.set("c", "info", { v: 3 });
    expect(cache.get("b", "info")).toBeUndefined();
    expect(cache.get("c", "info")).toEqual({ v: 3 });
    cache.invalidate("a");
    expect(cache.get("a", "info")).toBeUndefined();
  });

  it("drops expired values lazily", async () => {
    const cache = new MemoryIntegrationCache(10, 10);
    cache.set("a", "op", "value");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(cache.get("a", "op")).toBeUndefined();
  });
});
