import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv";
import { formatBasisPoints, sloStatusLabel } from "./labels";

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
