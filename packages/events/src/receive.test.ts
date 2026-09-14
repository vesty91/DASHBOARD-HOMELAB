import { describe, expect, it } from "vitest";
import { canReceiveEvent } from "./receive";
import type { DomainEvent } from "./events";
import type { RealtimeSubscription } from "./ticket";

const occurredAt = "2026-09-13T00:00:00.000Z";

describe("canReceiveEvent", () => {
  it("denies by default and isolates board, integration, and runtime scopes", () => {
    const boardA: RealtimeSubscription = { kind: "board", id: "board-a" };
    const boardB: RealtimeSubscription = { kind: "board", id: "board-b" };
    const jellyfin: RealtimeSubscription = { kind: "integration", id: "jellyfin-1" };
    const runtime: RealtimeSubscription = { kind: "runtime" };
    expect(
      canReceiveEvent([boardA], {
        type: "board.updated",
        boardId: "board-a",
        revision: 2,
        occurredAt,
      }),
    ).toBe(true);
    expect(
      canReceiveEvent([boardA], {
        type: "board.updated",
        boardId: "board-b",
        revision: 2,
        occurredAt,
      }),
    ).toBe(false);
    expect(
      canReceiveEvent([boardB], { type: "board.deleted", boardId: "board-a", occurredAt }),
    ).toBe(false);
    expect(
      canReceiveEvent([jellyfin], {
        type: "integration.updated",
        integrationId: "jellyfin-1",
        integrationType: "jellyfin",
        occurredAt,
      }),
    ).toBe(true);
    expect(
      canReceiveEvent([jellyfin], {
        type: "integration.data.changed",
        integrationId: "jellyfin-1",
        integrationType: "jellyfin",
        occurredAt,
      }),
    ).toBe(true);
    expect(
      canReceiveEvent([jellyfin], {
        type: "integration.data.changed",
        integrationId: "synology-1",
        integrationType: "synology",
        occurredAt,
      }),
    ).toBe(false);
    expect(
      canReceiveEvent([boardA, jellyfin], {
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt,
      }),
    ).toBe(false);
    expect(
      canReceiveEvent([runtime], {
        type: "job.failed",
        jobType: "heartbeat",
        errorCode: "REDIS_DOWN",
        occurredAt,
      }),
    ).toBe(true);
    expect(
      canReceiveEvent([runtime], {
        type: "board.updated",
        boardId: "board-a",
        revision: 1,
        occurredAt,
      }),
    ).toBe(false);
    expect(
      canReceiveEvent([], {
        type: "job.heartbeat",
        jobType: "heartbeat",
        occurredAt,
      }),
    ).toBe(false);
    expect(canReceiveEvent([runtime], { type: "unknown.event" } as unknown as DomainEvent)).toBe(
      false,
    );
  });
});
