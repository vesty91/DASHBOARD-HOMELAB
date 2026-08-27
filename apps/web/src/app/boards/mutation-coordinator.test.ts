import { describe, expect, it, vi } from "vitest";
import { createBoardMutationCoordinator } from "./mutation-coordinator";
import type { BoardMutationResult } from "./mutation-result";

function ok(revision: number): BoardMutationResult<{ revision: number }> {
  return { ok: true, revision };
}

describe("board mutation coordinator", () => {
  it("flushes a pending layout before a mutation and keeps revisions increasing", async () => {
    const calls: string[] = [];
    const saveLayout = vi.fn(async (input: { expectedRevision: number }) => {
      calls.push(`layout:${input.expectedRevision}`);
      return ok(input.expectedRevision + 1);
    });
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 1,
      saveLayout,
      onConflict: () => {
        throw new Error("conflict");
      },
      onError: () => {
        throw new Error("unexpected error");
      },
      debounceMs: 10_000,
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "item", x: 1, y: 0, w: 2, h: 2 }],
    });
    const result = await coordinator.runMutation(async (revision) => {
      calls.push(`item:${revision}`);
      expect(revision).toBe(2);
      return ok(revision + 1);
    });
    expect(result).toEqual(ok(3));
    expect(calls).toEqual(["layout:1", "item:2"]);
    expect(coordinator.getRevision()).toBe(3);
    expect(coordinator.hasConflict()).toBe(false);
  });

  it("freezes only on a true CONFLICT", async () => {
    let conflicts = 0;
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 4,
      saveLayout: async () => ({
        ok: false,
        code: "CONFLICT",
        message: "Le board a été modifié ailleurs.",
      }),
      onConflict: () => {
        conflicts += 1;
      },
      onError: () => {
        throw new Error("ordinary errors must not freeze");
      },
      debounceMs: 10_000,
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "item", x: 0, y: 0, w: 1, h: 1 }],
    });
    const result = await coordinator.runMutation(async () => ok(99));
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(conflicts).toBe(1);
    expect(coordinator.hasConflict()).toBe(true);
    expect(coordinator.getRevision()).toBe(4);
    const skipped = await coordinator.runMutation(async () => ok(100));
    expect(skipped).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(coordinator.getRevision()).toBe(4);
  });

  it("does not freeze on VALIDATION_ERROR and returns it to the caller", async () => {
    const errors: string[] = [];
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 8,
      saveLayout: async () => ok(8),
      onConflict: () => {
        throw new Error("must not freeze");
      },
      onError: (failure) => {
        errors.push(failure.code);
      },
      debounceMs: 10_000,
    });
    const result = await coordinator.runMutation(async () => ({
      ok: false as const,
      code: "VALIDATION_ERROR" as const,
      message: "Les données saisies sont invalides.",
    }));
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
    expect(errors).toEqual(["VALIDATION_ERROR"]);
    expect(coordinator.hasConflict()).toBe(false);
    expect(coordinator.getRevision()).toBe(8);
  });

  it("lets a valid mutation succeed after an ordinary validation error", async () => {
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 5,
      saveLayout: async () => ok(5),
      onConflict: () => {
        throw new Error("must not freeze");
      },
      onError: () => undefined,
      debounceMs: 10_000,
    });
    await coordinator.runMutation(async () => ({
      ok: false as const,
      code: "VALIDATION_ERROR" as const,
      message: "invalid",
    }));
    const second = await coordinator.runMutation(async (revision) => {
      expect(revision).toBe(5);
      return ok(6);
    });
    expect(second).toEqual(ok(6));
    expect(coordinator.getRevision()).toBe(6);
    expect(coordinator.hasConflict()).toBe(false);
  });

  it("flushes pending layout before metadata then uses the new revision for item config", async () => {
    const calls: string[] = [];
    const saveLayout = vi.fn(async (input: { expectedRevision: number }) => {
      calls.push(`layout:${input.expectedRevision}`);
      return ok(input.expectedRevision + 1);
    });
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 10,
      saveLayout,
      onConflict: () => {
        throw new Error("conflict");
      },
      onError: () => {
        throw new Error("unexpected error");
      },
      debounceMs: 10_000,
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "clock", x: 2, y: 0, w: 4, h: 2 }],
    });
    await coordinator.runMutation(async (revision) => {
      calls.push(`metadata:${revision}`);
      expect(revision).toBe(11);
      return ok(12);
    });
    await coordinator.runMutation(async (revision) => {
      calls.push(`item:${revision}`);
      expect(revision).toBe(12);
      return ok(13);
    });
    expect(calls).toEqual(["layout:10", "metadata:11", "item:12"]);
    expect(coordinator.getRevision()).toBe(13);
  });

  it("uses the metadata revision for a later layout autosave", async () => {
    const saveLayout = vi.fn(async (input: { expectedRevision: number }) =>
      ok(input.expectedRevision + 1),
    );
    const coordinator = createBoardMutationCoordinator({
      initialRevision: 20,
      saveLayout,
      onConflict: () => {
        throw new Error("conflict");
      },
      onError: () => {
        throw new Error("unexpected error");
      },
      debounceMs: 10_000,
    });
    await coordinator.runMutation(async (revision) => {
      expect(revision).toBe(20);
      return ok(21);
    });
    coordinator.scheduleLayout({
      layoutId: "layout",
      items: [{ itemId: "clock", x: 1, y: 0, w: 4, h: 2 }],
    });
    await coordinator.flushLayout();
    expect(saveLayout).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 21 }));
    expect(coordinator.getRevision()).toBe(22);
  });
});
