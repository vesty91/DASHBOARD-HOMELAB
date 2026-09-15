import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { resolveCustomApiValueViews } from "./resolve-custom-api-value";

const snapshot = {
  items: [
    {
      id: "item-1",
      widgetType: "custom-api-value",
      runtimeStatus: "ready",
      config: {
        integrationId: "11111111-1111-4111-8111-111111111111",
        endpointKey: "status",
        jsonPath: "value",
        display: "text",
        label: "Charge",
      },
    },
    { id: "item-2", widgetType: "clock", runtimeStatus: "ready", config: {} },
  ],
} as unknown as BoardSnapshot;

describe("resolveCustomApiValueViews", () => {
  it("maps a bounded value and isolates permission errors", async () => {
    const views = await resolveCustomApiValueViews(snapshot, {
      customApi: {
        value: {
          get: async () => ({
            status: "available",
            fetchedAt: "2026-09-15T00:00:00.000Z",
            endpointKey: "status",
            value: { status: "available", data: { display: "text", text: "42" } },
          }),
        },
      },
    });
    expect(views["item-1"]).toMatchObject({
      status: "ready",
      text: "42",
      label: "Charge",
    });
    expect(views["item-2"]).toBeUndefined();

    const denied = await resolveCustomApiValueViews(snapshot, {
      customApi: {
        value: {
          get: async () => {
            throw new TRPCError({ code: "FORBIDDEN", message: "no" });
          },
        },
      },
    });
    expect(denied["item-1"]).toEqual({ status: "permission-denied" });

    const missing = await resolveCustomApiValueViews(snapshot, {
      customApi: {
        value: {
          get: async () => {
            throw new TRPCError({ code: "NOT_FOUND", message: "gone" });
          },
        },
      },
    });
    expect(missing["item-1"]).toEqual({ status: "empty" });

    const failed = await resolveCustomApiValueViews(snapshot, {
      customApi: {
        value: {
          get: async () => {
            throw new TRPCError({ code: "TIMEOUT", message: "slow" });
          },
        },
      },
    });
    expect(failed["item-1"]).toEqual({ status: "error" });
  });
});
