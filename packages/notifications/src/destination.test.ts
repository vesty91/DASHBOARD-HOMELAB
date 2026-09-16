import { describe, expect, it } from "vitest";
import { assertSafeDestinationPath, safeDestinationPath } from "./destination";
import { NotificationError } from "./errors";

describe("destination paths", () => {
  it("allows internal allowlisted paths", () => {
    expect(safeDestinationPath("/incidents/abc-123")).toBe("/incidents/abc-123");
    expect(safeDestinationPath("/notifications")).toBe("/notifications");
    expect(safeDestinationPath("/integrations/foo/edit")).toBe("/integrations/foo/edit");
    expect(assertSafeDestinationPath("/boards/home")).toBe("/boards/home");
    expect(safeDestinationPath("/status-pages/maintenance/abc-123")).toBe(
      "/status-pages/maintenance/abc-123",
    );
  });

  it("rejects external, traversal, and query destinations", () => {
    expect(safeDestinationPath("https://evil.example")).toBeNull();
    expect(safeDestinationPath("//evil.example")).toBeNull();
    expect(safeDestinationPath("/boards/../etc/passwd")).toBeNull();
    expect(safeDestinationPath("/notifications?x=1")).toBeNull();
    expect(safeDestinationPath("/unknown")).toBeNull();
    expect(() => assertSafeDestinationPath("https://evil.example")).toThrow(NotificationError);
  });
});
