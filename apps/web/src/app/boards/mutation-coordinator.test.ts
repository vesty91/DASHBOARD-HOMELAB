import { describe, expect, it, vi } from "vitest";
import { createBoardMutationCoordinator } from "./mutation-coordinator";

describe("board mutation coordinator", () => {
  it("flushes a pending layout before an item mutation and keeps revisions increasing", async () => {
    const calls: string[] = [];
    const saveLayout = vi.fn(async (input: { expectedRevision: number }) => {
      calls.push(`layout:${input.expectedRevision}`);
      return input.expectedRevision + 1;
    });
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 1,
      saveLayout,
      onConflict: () => {
        throw new Error("conflict");
      },
      debounceMs: 10_000,
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "item", x: 1, y: 0, w: 2, h: 2 }],
    });
    await coordinator.runItemMutation(async (revision) => {
      calls.push(`item:${revision}`);
      expect(revision).toBe(2);
      return revision + 1;
    });
    expect(calls).toEqual(["layout:1", "item:2"]);
    expect(coordinator.getRevision()).toBe(3);
  });

  it("stops the chain after a conflict", async () => {
    let conflicts = 0;
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 4,
      saveLayout: async () => {
        throw new Error("stale");
      },
      onConflict: () => {
        conflicts += 1;
      },
      debounceMs: 10_000,
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "item", x: 0, y: 0, w: 1, h: 1 }],
    });
    await coordinator.runItemMutation(async () => 99);
    expect(conflicts).toBe(1);
    expect(coordinator.hasConflict()).toBe(true);
    expect(coordinator.getRevision()).toBe(4);
  });
});
