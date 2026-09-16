import { describe, expect, it } from "vitest";
import { computeSloFromDaily } from "./slo-math";

describe("slo math", () => {
  it("computes 99.9% objective error budget on a clean week", () => {
    const days = Array.from({ length: 7 }, () => ({
      observedSeconds: 86_400,
      availableSeconds: 86_400,
      degradedSeconds: 0,
      unavailableSeconds: 0,
      maintenanceSeconds: 0,
      unknownSeconds: 0,
    }));
    const result = computeSloFromDaily({
      days,
      windowDays: 7,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(result.zeroObservations).toBe(false);
    expect(result.availabilityBasisPoints).toBe(100_000);
    expect(result.allowedDowntimeSeconds).toBe(Math.floor((7 * 86_400 * 100) / 100_000));
    expect(result.consumedDowntimeSeconds).toBe(0);
    expect(result.remainingBudgetBasisPoints).toBe(100_000);
  });

  it("excludes unknown and optionally maintenance from eligible time", () => {
    const result = computeSloFromDaily({
      days: [
        {
          observedSeconds: 86_400,
          availableSeconds: 40_000,
          degradedSeconds: 0,
          unavailableSeconds: 10_000,
          maintenanceSeconds: 20_000,
          unknownSeconds: 16_400,
        },
      ],
      windowDays: 7,
      objectiveBasisPoints: 99_000,
      excludeMaintenance: true,
    });
    expect(result.eligibleSeconds).toBe(50_000);
    expect(result.availabilityBasisPoints).toBe(80_000);
    expect(result.consumedDowntimeSeconds).toBe(10_000);
  });

  it("rejects 100% objective via assert", () => {
    expect(() =>
      computeSloFromDaily({
        days: [],
        windowDays: 30,
        objectiveBasisPoints: 100_000,
        excludeMaintenance: true,
      }),
    ).toThrow(/SLO_OBJECTIVE_OUT_OF_RANGE/);
  });
});
