import { describe, expect, it } from "vitest";
import { isAllowedRealtimeOrigin } from "./origin";

describe("realtime origin allowlist", () => {
  it("rejects a mismatched browser Origin when APP_URL is configured", () => {
    expect(isAllowedRealtimeOrigin(undefined, undefined)).toBe(true);
    expect(isAllowedRealtimeOrigin("https://evil.example", undefined)).toBe(true);
    expect(isAllowedRealtimeOrigin(undefined, "https://dashboard.example")).toBe(true);
    expect(isAllowedRealtimeOrigin("https://dashboard.example", "https://dashboard.example")).toBe(
      true,
    );
    expect(isAllowedRealtimeOrigin("https://evil.example", "https://dashboard.example")).toBe(
      false,
    );
    expect(isAllowedRealtimeOrigin("not-a-url", "https://dashboard.example")).toBe(false);
  });
});
