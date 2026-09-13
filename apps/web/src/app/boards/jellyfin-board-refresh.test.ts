import { describe, expect, it } from "vitest";
import { JELLYFIN_BOARD_REFRESH_MS, shouldPollJellyfinBoard } from "./jellyfin-board-refresh";

describe("jellyfin board refresh", () => {
  it("polls only when the board already resolved Jellyfin widgets", () => {
    expect(JELLYFIN_BOARD_REFRESH_MS).toBe(10_000);
    expect(shouldPollJellyfinBoard({})).toBe(false);
    expect(shouldPollJellyfinBoard({ "item-1": { status: "ready" } })).toBe(true);
  });
});
