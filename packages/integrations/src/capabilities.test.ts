import { describe, expect, it } from "vitest";
import { hasCapability, normalizeCapabilities, requireCapability } from "./capabilities";

describe("capabilities", () => {
  it("normalizes unique capabilities and rejects duplicates", () => {
    expect(normalizeCapabilities(["test.ping", "system.read"])).toEqual([
      "test.ping",
      "system.read",
    ]);
    expect(() => normalizeCapabilities(["test.ping", "test.ping"])).toThrow();
    expect(() => normalizeCapabilities(["Docker.Start"])).toThrow();
    expect(hasCapability(["test.ping"], "test.ping")).toBe(true);
    expect(() => requireCapability(["test.ping"], "containers.start")).toThrow();
  });
});
