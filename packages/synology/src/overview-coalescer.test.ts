import { describe, expect, it } from "vitest";
import { MemorySynologyOverviewCoalescer } from "./overview-coalescer";

function createBarrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("MemorySynologyOverviewCoalescer", () => {
  it("joins concurrent callers on the same key and cleans up after success", async () => {
    const coalescer = new MemorySynologyOverviewCoalescer();
    const started = createBarrier();
    const release = createBarrier();
    let factoryCalls = 0;
    const factory = async () => {
      factoryCalls += 1;
      started.release();
      await release.promise;
      return "shared";
    };

    const first = coalescer.run("k", factory);
    await started.promise;
    expect(coalescer.size).toBe(1);
    const second = coalescer.run("k", factory);
    release.release();
    await expect(Promise.all([first, second])).resolves.toEqual(["shared", "shared"]);
    expect(factoryCalls).toBe(1);
    expect(coalescer.size).toBe(0);
  });

  it("cleans up a rejected flight so a later caller can retry", async () => {
    const coalescer = new MemorySynologyOverviewCoalescer();
    const started = createBarrier();
    const release = createBarrier();
    let factoryCalls = 0;
    const failing = async () => {
      factoryCalls += 1;
      started.release();
      await release.promise;
      throw new Error("boom");
    };

    const first = coalescer.run("k", failing);
    const second = coalescer.run("k", failing);
    await started.promise;
    release.release();
    await expect(first).rejects.toThrow("boom");
    await expect(second).rejects.toThrow("boom");
    expect(factoryCalls).toBe(1);
    expect(coalescer.size).toBe(0);

    await expect(coalescer.run("k", async () => "ok")).resolves.toBe("ok");
    expect(factoryCalls).toBe(1);
    expect(coalescer.size).toBe(0);
  });

  it("does not evict an in-flight promise when at capacity", async () => {
    const coalescer = new MemorySynologyOverviewCoalescer(1);
    const hold = createBarrier();
    const first = coalescer.run("a", async () => {
      await hold.promise;
      return "a";
    });
    expect(coalescer.size).toBe(1);

    let extraCalls = 0;
    const overflowA = coalescer.run("b", async () => {
      extraCalls += 1;
      return "b1";
    });
    const overflowB = coalescer.run("b", async () => {
      extraCalls += 1;
      return "b2";
    });
    expect(coalescer.size).toBe(1);
    await expect(Promise.all([overflowA, overflowB])).resolves.toEqual(["b1", "b2"]);
    expect(extraCalls).toBe(2);

    hold.release();
    await expect(first).resolves.toBe("a");
    expect(coalescer.size).toBe(0);
  });
});
