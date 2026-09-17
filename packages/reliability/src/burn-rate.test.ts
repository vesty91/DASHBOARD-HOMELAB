import { describe, expect, it } from "vitest";
import {
  aggregateBucketsForBurn,
  classifyBurnAgainstThresholds,
  classifyBurnPair,
  computeBurnRateForWindow,
  evaluateBurnRate,
  listClosedUtcHours,
  type HourlyBucketInput,
} from "./burn-rate";

function hour(
  partial: Partial<HourlyBucketInput> & { observedSeconds: number },
): HourlyBucketInput {
  return {
    availableSeconds: partial.availableSeconds ?? 0,
    degradedSeconds: partial.degradedSeconds ?? 0,
    unavailableSeconds: partial.unavailableSeconds ?? 0,
    maintenanceSeconds: partial.maintenanceSeconds ?? 0,
    unknownSeconds: partial.unknownSeconds ?? 0,
    observedSeconds: partial.observedSeconds,
  };
}

/** N full hours of pure availability. */
function cleanHours(n: number): HourlyBucketInput[] {
  return Array.from({ length: n }, () => hour({ observedSeconds: 3600, availableSeconds: 3600 }));
}

describe("burn-rate math", () => {
  it("returns insufficient-data / null burn on zero eligible observations", () => {
    const result = computeBurnRateForWindow({
      hours: [],
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(result.zeroObservations).toBe(true);
    expect(result.burnRate).toBeNull();
    expect(result.badFraction).toBeNull();
    expect(
      classifyBurnAgainstThresholds({
        burnRate: result.burnRate,
        zeroObservations: result.zeroObservations,
        warningThreshold: 1,
        criticalThreshold: 14.4,
      }),
    ).toBe("insufficient-data");
  });

  it("never classifies healthy when burnRate is null", () => {
    expect(
      classifyBurnAgainstThresholds({
        burnRate: null,
        zeroObservations: false,
        warningThreshold: 1,
        criticalThreshold: 6,
      }),
    ).toBe("insufficient-data");
  });

  it("computes burnRate = 0 for 100% available window", () => {
    const result = computeBurnRateForWindow({
      hours: cleanHours(1),
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(result.zeroObservations).toBe(false);
    expect(result.eligibleSeconds).toBe(3600);
    expect(result.consumedDowntimeSeconds).toBe(0);
    expect(result.badFraction).toBe(0);
    expect(result.burnRate).toBe(0);
    expect(result.budgetRemainingFraction).toBe(1);
    expect(result.errorBudgetFraction).toBeCloseTo(0.001, 10);
  });

  it("computes outage burn rate against error budget", () => {
    // 99.9% SLO => error budget 0.1%. Full hour unavailable => badFraction=1
    // burnRate = 1 / 0.001 = 1000
    const result = computeBurnRateForWindow({
      hours: [hour({ observedSeconds: 3600, unavailableSeconds: 3600 })],
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(result.badFraction).toBe(1);
    expect(result.burnRate).toBeCloseTo(1000, 8);
    expect(result.budgetRemainingFraction).toBe(0);
  });

  it("excludes maintenance when excludeMaintenance=true", () => {
    const result = computeBurnRateForWindow({
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 1800,
          maintenanceSeconds: 1800,
        }),
      ],
      windowHours: 1,
      objectiveBasisPoints: 99_000,
      excludeMaintenance: true,
    });
    expect(result.eligibleSeconds).toBe(1800);
    expect(result.consumedDowntimeSeconds).toBe(0);
    expect(result.burnRate).toBe(0);
  });

  it("keeps maintenance in denominator when excludeMaintenance=false", () => {
    const result = computeBurnRateForWindow({
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 1800,
          maintenanceSeconds: 1800,
        }),
      ],
      windowHours: 1,
      objectiveBasisPoints: 99_000,
      excludeMaintenance: false,
    });
    // eligible = 3600, good = 1800, consumed = 1800, bad = 0.5
    // error budget = 0.01, burn = 50
    expect(result.eligibleSeconds).toBe(3600);
    expect(result.consumedDowntimeSeconds).toBe(1800);
    expect(result.burnRate).toBeCloseTo(50, 8);
  });

  it("excludes unknown from eligible (Phase 26 policy)", () => {
    const result = computeBurnRateForWindow({
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 1000,
          unavailableSeconds: 1000,
          unknownSeconds: 1600,
        }),
      ],
      windowHours: 1,
      objectiveBasisPoints: 99_000,
      excludeMaintenance: true,
    });
    expect(result.eligibleSeconds).toBe(2000);
    expect(result.consumedDowntimeSeconds).toBe(1000);
    expect(result.badFraction).toBeCloseTo(0.5, 10);
  });

  it("treats degraded as consumed downtime", () => {
    const agg = aggregateBucketsForBurn({
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 3000,
          degradedSeconds: 600,
        }),
      ],
      excludeMaintenance: true,
    });
    expect(agg.consumedDowntimeSeconds).toBe(600);
  });

  it("handles exhausted budget (budgetRemaining=0)", () => {
    const result = computeBurnRateForWindow({
      hours: [hour({ observedSeconds: 3600, unavailableSeconds: 3600 })],
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(result.budgetRemainingFraction).toBe(0);
  });

  it("handles high SLO objective (99.999%) without overflow", () => {
    // errorBudgetFraction = 0.00001; 1s down in 3600 => bad ≈ 1/3600
    // burn ≈ (1/3600) / 0.00001 ≈ 27.777...
    const result = computeBurnRateForWindow({
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 3599,
          unavailableSeconds: 1,
        }),
      ],
      windowHours: 1,
      objectiveBasisPoints: 99_999,
      excludeMaintenance: true,
    });
    expect(result.burnRate).toBeCloseTo(1 / 3600 / 0.00001, 6);
    expect(Number.isFinite(result.burnRate!)).toBe(true);
  });

  it("rejects objective outside range", () => {
    expect(() =>
      computeBurnRateForWindow({
        hours: cleanHours(1),
        windowHours: 1,
        objectiveBasisPoints: 100_000,
        excludeMaintenance: true,
      }),
    ).toThrow(/SLO_OBJECTIVE_OUT_OF_RANGE/);
  });

  it("uses AND semantics for paired windows", () => {
    const short = computeBurnRateForWindow({
      hours: [hour({ observedSeconds: 3600, unavailableSeconds: 3600 })],
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    const longClean = computeBurnRateForWindow({
      hours: cleanHours(6),
      windowHours: 6,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    // Short critical alone is not enough
    expect(
      classifyBurnPair({
        short,
        long: longClean,
        warningThreshold: 1,
        criticalThreshold: 14.4,
      }),
    ).toBe("healthy");

    const longBad = computeBurnRateForWindow({
      hours: Array.from({ length: 6 }, () =>
        hour({ observedSeconds: 3600, unavailableSeconds: 3600 }),
      ),
      windowHours: 6,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(
      classifyBurnPair({
        short,
        long: longBad,
        warningThreshold: 1,
        criticalThreshold: 14.4,
      }),
    ).toBe("critical");
  });

  it("pair is insufficient-data if either window lacks data", () => {
    const short = computeBurnRateForWindow({
      hours: cleanHours(1),
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    const longEmpty = computeBurnRateForWindow({
      hours: [],
      windowHours: 6,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(
      classifyBurnPair({
        short,
        long: longEmpty,
        warningThreshold: 1,
        criticalThreshold: 14.4,
      }),
    ).toBe("insufficient-data");
  });

  it("evaluateBurnRate overall never healthy with zero data", () => {
    const evaluation = evaluateBurnRate({
      hoursByWindow: {},
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
      warningThreshold: 1,
      criticalThreshold: 14.4,
    });
    expect(evaluation.state).toBe("insufficient-data");
    expect(evaluation.pairs.fast.state).toBe("insufficient-data");
    expect(evaluation.pairs.slow.state).toBe("insufficient-data");
  });

  it("evaluateBurnRate healthy when all closed windows are clean", () => {
    const evaluation = evaluateBurnRate({
      hoursByWindow: {
        1: cleanHours(1),
        6: cleanHours(6),
        24: cleanHours(24),
        72: cleanHours(72),
      },
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
      warningThreshold: 1,
      criticalThreshold: 14.4,
    });
    expect(evaluation.state).toBe("healthy");
    expect(evaluation.pairs.fast.state).toBe("healthy");
    expect(evaluation.pairs.slow.state).toBe("healthy");
  });

  it("listClosedUtcHours excludes the open current hour", () => {
    // 2026-09-17T15:30:00Z → current hour 15 open; last closed = 14
    const asOfMs = Date.UTC(2026, 8, 17, 15, 30, 0);
    const hours = listClosedUtcHours({ asOfMs, windowHours: 3 });
    expect(hours).toEqual(["2026-09-17T12", "2026-09-17T13", "2026-09-17T14"]);
    expect(hours).not.toContain("2026-09-17T15");
  });

  it("listClosedUtcHours crosses day boundary", () => {
    const asOfMs = Date.UTC(2026, 8, 17, 1, 5, 0);
    const hours = listClosedUtcHours({ asOfMs, windowHours: 3 });
    expect(hours).toEqual(["2026-09-16T22", "2026-09-16T23", "2026-09-17T00"]);
  });

  it("warning vs critical thresholds are ordered", () => {
    const mid = computeBurnRateForWindow({
      // badFraction small enough for burn ~ 2 with 99.9% (budget 0.001)
      // consumed/eligible = 0.002 => burn = 2
      hours: [
        hour({
          observedSeconds: 3600,
          availableSeconds: 3593,
          unavailableSeconds: 7, // 7/3600 ≈ 0.00194 → burn ≈ 1.94
        }),
      ],
      windowHours: 1,
      objectiveBasisPoints: 99_900,
      excludeMaintenance: true,
    });
    expect(mid.burnRate!).toBeGreaterThan(1);
    expect(mid.burnRate!).toBeLessThan(14.4);
    expect(
      classifyBurnAgainstThresholds({
        burnRate: mid.burnRate,
        zeroObservations: false,
        warningThreshold: 1,
        criticalThreshold: 14.4,
      }),
    ).toBe("warning");
  });
});
