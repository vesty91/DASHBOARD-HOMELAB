import { describe, expect, it, vi } from "vitest";
import { collectLiveIntegrationIds } from "./live-integration-ids";
import { createKeyedDebouncer } from "./live-debounce";
import { shouldRefreshFromLiveEvent } from "./live-event-filter";

describe("live integration ids", () => {
  it("collects configured ids and ignores unset placeholders", () => {
    expect(
      collectLiveIntegrationIds([
        { config: { integrationId: "00000000-0000-4000-8000-000000000000" } },
        { config: { integrationId: "11111111-1111-4111-8111-111111111111" } },
        {
          config: {
            selectedIds: [
              "jellyfin:22222222-2222-4222-8222-222222222222",
              "app:33333333-3333-4333-8333-333333333333",
            ],
          },
        },
      ]),
    ).toEqual(["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"]);
  });

  it("collects source-selected service-status integration ids from resolved views", () => {
    expect(
      collectLiveIntegrationIds([{ config: { selectedSources: ["jellyfin"], selectedIds: [] } }], {
        "item-1": {
          status: "ready",
          items: [
            { integrationId: "44444444-4444-4444-8444-444444444444" },
            { integrationId: null },
          ],
        },
      }),
    ).toEqual(["44444444-4444-4444-8444-444444444444"]);
  });
});

describe("live event filter", () => {
  it("refetches matching integrations and ignores other ids or malformed payloads", () => {
    const ids = ["11111111-1111-4111-8111-111111111111"];
    expect(
      shouldRefreshFromLiveEvent(
        "integration.data.changed",
        JSON.stringify({ integrationId: ids[0] }),
        ids,
      ),
    ).toBe(true);
    expect(
      shouldRefreshFromLiveEvent(
        "integration.data.changed",
        JSON.stringify({ integrationId: "22222222-2222-4222-8222-222222222222" }),
        ids,
      ),
    ).toBe(false);
    expect(shouldRefreshFromLiveEvent("integration.data.changed", "{", ids)).toBe(false);
    expect(shouldRefreshFromLiveEvent("board.updated", "", ids)).toBe(true);
  });
});

describe("keyed debouncer", () => {
  it("coalesces a burst for the same key and ignores other keys independently", () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const debouncer = createKeyedDebouncer(400, run);
    debouncer.trigger("a");
    debouncer.trigger("a");
    debouncer.trigger("b");
    vi.advanceTimersByTime(399);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenNthCalledWith(1, "a");
    expect(run).toHaveBeenNthCalledWith(2, "b");
    debouncer.clear();
    vi.useRealTimers();
  });
});
