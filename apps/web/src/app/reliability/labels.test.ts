import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv";
import {
  burnStateTone,
  formatBasisPoints,
  formatBudgetRemaining,
  formatBurnRate,
  formatUtcDateTime,
  sloStatusLabel,
} from "./labels";

describe("reliability labels", () => {
  it("formats basis points as percent", () => {
    expect(formatBasisPoints(99900)).toBe("99.900 %");
    expect(formatBasisPoints(null)).toBe("—");
  });

  it("labels slo status", () => {
    expect(sloStatusLabel(true)).toBe("Respecté");
    expect(sloStatusLabel(false)).toBe("Dépassé");
    expect(sloStatusLabel(null)).toBe("Sans SLO");
  });

  it("maps burn-rate states to badge tones", () => {
    expect(burnStateTone("healthy")).toBe("success");
    expect(burnStateTone("warning")).toBe("warning");
    expect(burnStateTone("critical")).toBe("danger");
    expect(burnStateTone("insufficient-data")).toBe("neutral");
  });

  it("formats burn rate and budget", () => {
    expect(formatBurnRate(1.5)).toBe("1.50×");
    expect(formatBurnRate(null)).toBe("—");
    expect(formatBudgetRemaining(0.42)).toBe("42.0 %");
    expect(formatBudgetRemaining(null)).toBe("—");
  });

  it("formats utc datetimes", () => {
    expect(formatUtcDateTime(null)).toBe("—");
    expect(formatUtcDateTime("2026-01-15T12:00:00.000Z")).toMatch(/2026/);
  });
});

describe("escapeCsvCell", () => {
  it("quotes cells starting with formula characters", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe('"=SUM(A1)"');
    expect(escapeCsvCell("+123")).toBe('"+123"');
    expect(escapeCsvCell("-1")).toBe('"-1"');
    expect(escapeCsvCell("@mention")).toBe('"@mention"');
  });

  it("leaves plain numbers unquoted", () => {
    expect(escapeCsvCell(86400)).toBe("86400");
  });
});
