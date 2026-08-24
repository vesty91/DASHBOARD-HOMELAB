import { describe, expect, it } from "vitest";

describe("phase 1 bootstrap", () => {
  it("keeps the test runner wired", () => {
    expect("homelab-dashboard").toContain("dashboard");
  });
});
