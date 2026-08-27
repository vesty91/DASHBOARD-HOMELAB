import { describe, expect, it } from "vitest";
import { appTileConfigSchema } from "./app-tile";

describe("app tile widget", () => {
  it("requires a UUID app id and boolean display flags", () => {
    expect(
      appTileConfigSchema.parse({
        appId: "22222222-2222-4222-8222-222222222222",
        showStatus: false,
        showLatency: true,
      }),
    ).toEqual({
      appId: "22222222-2222-4222-8222-222222222222",
      showStatus: false,
      showLatency: true,
    });
    expect(appTileConfigSchema.safeParse({ appId: "not-a-uuid" }).success).toBe(false);
    expect(appTileConfigSchema.safeParse({ appId: "" }).success).toBe(false);
  });
});
