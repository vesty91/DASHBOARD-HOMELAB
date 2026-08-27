import { describe, expect, it } from "vitest";
import { clockConfigSchema, formatClock } from "./clock";

describe("clock widget", () => {
  const date = new Date("2024-06-15T12:00:00.000Z");

  it("formats UTC 24h without seconds", () => {
    const formatted = formatClock(
      date,
      {
        timezone: "UTC",
        showDate: false,
        showSeconds: false,
        hour12: false,
      },
      "en-US",
    );
    expect(formatted.time).toMatch(/12:00/);
    expect(formatted.dateLabel).toBeNull();
  });

  it("formats a different timezone with date and seconds", () => {
    const formatted = formatClock(
      date,
      { timezone: "America/New_York", showDate: true, showSeconds: true, hour12: true },
      "en-US",
    );
    expect(formatted.time).toMatch(/8:00:00/);
    expect(formatted.dateLabel).toMatch(/June/);
  });

  it("rejects invalid timezones", () => {
    expect(clockConfigSchema.safeParse({ timezone: "Not/A_Zone" }).success).toBe(false);
    expect(
      clockConfigSchema.parse({
        timezone: "Europe/Paris",
        showDate: true,
        showSeconds: false,
        hour12: false,
      }).timezone,
    ).toBe("Europe/Paris");
  });
});
