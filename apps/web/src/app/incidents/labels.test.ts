import { describe, expect, it } from "vitest";
import { formatIncidentDuration } from "./labels";

describe("formatIncidentDuration", () => {
  it("formats short and long durations", () => {
    const opened = "2026-09-16T10:00:00.000Z";
    expect(formatIncidentDuration(opened, "2026-09-16T10:00:45.000Z")).toBe("45s");
    expect(formatIncidentDuration(opened, "2026-09-16T10:12:00.000Z")).toBe("12 min");
    expect(formatIncidentDuration(opened, "2026-09-16T13:15:00.000Z")).toBe("3 h 15 min");
    expect(formatIncidentDuration(opened, "2026-09-18T12:00:00.000Z")).toBe("2 j 2 h");
  });
});
