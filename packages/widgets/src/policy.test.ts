import { describe, expect, it } from "vitest";
import { createBuiltInWidgetPolicy } from "./index";

describe("built-in widget policy", () => {
  const policy = createBuiltInWidgetPolicy();

  it("marks publicSafe according to the Phase 6 policy", () => {
    expect(policy.resolve("clock", 1, { timezone: "UTC" })).toMatchObject({
      status: "ready",
      publicSafe: true,
    });
    expect(
      policy.resolve("bookmarks", 1, {
        links: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            title: "Home",
            url: "https://example.com",
            target: "same-tab",
          },
        ],
      }),
    ).toMatchObject({ status: "ready", publicSafe: false });
    expect(
      policy.resolve("app-tile", 1, {
        appId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toMatchObject({ status: "ready", publicSafe: false });
  });

  it("exposes sizing for first-fit placement", () => {
    expect(policy.getSizing("clock")).toEqual({
      defaultSize: { w: 4, h: 2 },
      minSize: { w: 2, h: 1 },
      maxSize: { w: 8, h: 4 },
    });
  });
});
