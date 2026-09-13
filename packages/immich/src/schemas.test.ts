import { describe, expect, it } from "vitest";
import { immichSecretSchema, immichStatsResponseSchema } from "./schemas";

describe("immich schemas", () => {
  it("accepts a visible ASCII API key", () => {
    expect(immichSecretSchema.parse({ apiKey: "IM-TOKEN_~!ok" })).toEqual({
      apiKey: "IM-TOKEN_~!ok",
    });
  });

  it.each(["", " key", "key\n", "clé", "\u0000secret"])("rejects unsafe API key %j", (apiKey) => {
    expect(immichSecretSchema.safeParse({ apiKey }).success).toBe(false);
  });

  it("rejects negative statistics", () => {
    expect(immichStatsResponseSchema.safeParse({ photos: -1, videos: 0, usage: 0 }).success).toBe(
      false,
    );
  });
});
