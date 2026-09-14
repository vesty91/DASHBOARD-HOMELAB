import { describe, expect, it } from "vitest";
import { ConnectionLimiter, shouldCloseSlowConsumer } from "./limits";
import { authorizedEvent } from "./authorized-event";
import { ticketFromUrl } from "./ticket-from-request";

describe("connection limiter", () => {
  it("enforces global and per-user caps", () => {
    const limiter = new ConnectionLimiter(2, 1);
    expect(limiter.tryAcquire("a")).toBe(true);
    expect(limiter.tryAcquire("a")).toBe(false);
    expect(limiter.tryAcquire("b")).toBe(true);
    expect(limiter.tryAcquire("c")).toBe(false);
    limiter.release("a");
    expect(limiter.tryAcquire("c")).toBe(true);
    expect(limiter.size).toBe(2);
  });

  it("closes a slow consumer when the buffer is exceeded", () => {
    expect(shouldCloseSlowConsumer(64_385, 64_384)).toBe(true);
    expect(shouldCloseSlowConsumer(64_384, 64_384)).toBe(false);
  });
});

describe("authorizedEvent", () => {
  it("denies unknown types and unauthorized resources", () => {
    expect(authorizedEvent([{ kind: "board", id: "board-a" }], { type: "unknown" })).toBeNull();
    expect(
      authorizedEvent([{ kind: "board", id: "board-a" }], {
        type: "board.updated",
        boardId: "board-b",
        revision: 1,
        occurredAt: "2026-09-13T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      authorizedEvent([{ kind: "board", id: "board-a" }], {
        type: "board.updated",
        boardId: "board-a",
        revision: 1,
        occurredAt: "2026-09-13T00:00:00.000Z",
      }),
    ).toMatchObject({ type: "board.updated", boardId: "board-a" });
  });
});

describe("ticketFromUrl", () => {
  it("rejects missing, empty, and oversized tickets", () => {
    expect(ticketFromUrl("/ws")).toBeNull();
    expect(ticketFromUrl("/ws?ticket=")).toBeNull();
    expect(ticketFromUrl(`/ws?ticket=${"a".repeat(9_000)}`)).toBeNull();
    expect(ticketFromUrl("/ws?ticket=ok")).toBe("ok");
  });
});
