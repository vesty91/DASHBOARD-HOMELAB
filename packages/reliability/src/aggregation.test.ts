import { describe, expect, it } from "vitest";
import {
  accountDayBuckets,
  accountHourBuckets,
  assertRollupInvariants,
  buildDailyRollup,
  buildHourlyRollup,
  clampRebuildDays,
  listUtcDatesInclusive,
  listUtcHoursInclusive,
  utcDayEndMs,
  utcDayStartMs,
  utcHourEndMs,
  utcHourStartMs,
  utcHourString,
} from "./aggregation";

const SERVICE = "svc-1";

describe("reliability aggregation", () => {
  it("accounts an all-available UTC day", () => {
    const day = "2030-01-15";
    const result = accountDayBuckets({
      dateUtc: day,
      nowMs: utcDayEndMs(day),
      observableFromMs: utcDayStartMs(day) - 1,
      incidents: [],
      maintenances: [],
    });
    expect(result.observedSeconds).toBe(86_400);
    expect(result.availableSeconds).toBe(86_400);
    expect(result.unavailableSeconds).toBe(0);
    expect(result.maintenanceSeconds).toBe(0);
    expect(result.unknownSeconds).toBe(0);
  });

  it("splits outage across midnight without double count", () => {
    const d0 = "2030-01-15";
    const d1 = "2030-01-16";
    const open = utcDayStartMs(d0) + 22 * 3600_000;
    const resolve = utcDayStartMs(d1) + 2 * 3600_000;
    const a = accountDayBuckets({
      dateUtc: d0,
      nowMs: utcDayEndMs(d1),
      observableFromMs: 0,
      incidents: [{ startsAtMs: open, endsAtMs: resolve }],
      maintenances: [],
    });
    const b = accountDayBuckets({
      dateUtc: d1,
      nowMs: utcDayEndMs(d1),
      observableFromMs: 0,
      incidents: [{ startsAtMs: open, endsAtMs: resolve }],
      maintenances: [],
    });
    expect(a.unavailableSeconds).toBe(2 * 3600);
    expect(b.unavailableSeconds).toBe(2 * 3600);
    expect(a.unavailableSeconds + b.unavailableSeconds).toBe(4 * 3600);
    expect(a.availableSeconds + a.unavailableSeconds).toBe(a.observedSeconds);
    expect(b.availableSeconds + b.unavailableSeconds).toBe(b.observedSeconds);
  });

  it("gives maintenance precedence over unavailable", () => {
    const day = "2030-02-01";
    const start = utcDayStartMs(day);
    const end = utcDayEndMs(day);
    const result = accountDayBuckets({
      dateUtc: day,
      nowMs: end,
      observableFromMs: 0,
      incidents: [{ startsAtMs: start, endsAtMs: end }],
      maintenances: [{ startsAtMs: start + 3600_000, endsAtMs: start + 3 * 3600_000 }],
    });
    expect(result.maintenanceSeconds).toBe(2 * 3600);
    expect(result.unavailableSeconds).toBe(86_400 - 2 * 3600);
    expect(
      result.availableSeconds +
        result.unavailableSeconds +
        result.maintenanceSeconds +
        result.unknownSeconds +
        result.degradedSeconds,
    ).toBe(result.observedSeconds);
  });

  it("marks pre-observability as unknown", () => {
    const day = "2030-03-01";
    const start = utcDayStartMs(day);
    const result = accountDayBuckets({
      dateUtc: day,
      nowMs: utcDayEndMs(day),
      observableFromMs: start + 6 * 3600_000,
      incidents: [],
      maintenances: [],
    });
    expect(result.unknownSeconds).toBe(6 * 3600);
    expect(result.availableSeconds).toBe(86_400 - 6 * 3600);
  });

  it("rebuild is idempotent for duplicate incident inputs", () => {
    const day = "2030-04-01";
    const open = utcDayStartMs(day) + 3600_000;
    const close = open + 1800_000;
    const incidents = [
      { id: "i1", serviceKey: SERVICE, openedAtMs: open, resolvedAtMs: close },
      { id: "i1", serviceKey: SERVICE, openedAtMs: open, resolvedAtMs: close },
    ];
    const a = buildDailyRollup({
      id: "r1",
      serviceKey: SERVICE,
      dateUtc: day,
      nowMs: utcDayEndMs(day),
      presence: { serviceKey: SERVICE, observableFromMs: 0 },
      incidents,
      maintenances: [],
    });
    const b = buildDailyRollup({
      id: "r2",
      serviceKey: SERVICE,
      dateUtc: day,
      nowMs: utcDayEndMs(day),
      presence: { serviceKey: SERVICE, observableFromMs: 0 },
      incidents,
      maintenances: [],
    });
    expect(a.unavailableSeconds).toBe(b.unavailableSeconds);
    expect(a.incidentCount).toBe(1);
    assertRollupInvariants(a);
  });

  it("lists utc dates and clamps rebuild days", () => {
    expect(listUtcDatesInclusive("2030-01-01", "2030-01-03")).toEqual([
      "2030-01-01",
      "2030-01-02",
      "2030-01-03",
    ]);
    expect(clampRebuildDays(0)).toBe(7);
    expect(clampRebuildDays(999)).toBe(90);
  });

  it("ignores DST by using UTC day boundaries only", () => {
    // US DST spring forward 2030-03-10 local — UTC day still 86400s.
    const day = "2030-03-10";
    const result = accountDayBuckets({
      dateUtc: day,
      nowMs: utcDayEndMs(day),
      observableFromMs: 0,
      incidents: [],
      maintenances: [],
    });
    expect(result.observedSeconds).toBe(86_400);
  });

  it("accounts a full UTC hour as available", () => {
    const hour = "2030-05-01T14";
    const result = accountHourBuckets({
      hourUtc: hour,
      nowMs: utcHourEndMs(hour),
      observableFromMs: utcHourStartMs(hour) - 1,
      incidents: [],
      maintenances: [],
    });
    expect(result.observedSeconds).toBe(3600);
    expect(result.availableSeconds).toBe(3600);
  });

  it("splits outage across hour boundaries without double count", () => {
    const h0 = "2030-06-01T22";
    const h1 = "2030-06-01T23";
    const open = utcHourStartMs(h0) + 30 * 60_000;
    const resolve = utcHourStartMs(h1) + 30 * 60_000;
    const a = accountHourBuckets({
      hourUtc: h0,
      nowMs: utcHourEndMs(h1),
      observableFromMs: 0,
      incidents: [{ startsAtMs: open, endsAtMs: resolve }],
      maintenances: [],
    });
    const b = accountHourBuckets({
      hourUtc: h1,
      nowMs: utcHourEndMs(h1),
      observableFromMs: 0,
      incidents: [{ startsAtMs: open, endsAtMs: resolve }],
      maintenances: [],
    });
    expect(a.unavailableSeconds).toBe(30 * 60);
    expect(b.unavailableSeconds).toBe(30 * 60);
    expect(a.unavailableSeconds + b.unavailableSeconds).toBe(3600);
  });

  it("builds hourly rollups and lists utc hours", () => {
    const hour = "2030-07-01T08";
    const open = utcHourStartMs(hour) + 900_000;
    const close = open + 600_000;
    const rollup = buildHourlyRollup({
      id: "h1",
      serviceKey: SERVICE,
      hourUtc: hour,
      nowMs: utcHourEndMs(hour),
      presence: { serviceKey: SERVICE, observableFromMs: 0 },
      incidents: [{ id: "i1", serviceKey: SERVICE, openedAtMs: open, resolvedAtMs: close }],
      maintenances: [],
    });
    expect(rollup.unavailableSeconds).toBe(600);
    expect(rollup.incidentCount).toBe(1);
    assertRollupInvariants(rollup);
    expect(listUtcHoursInclusive("2030-07-01T08", "2030-07-01T10")).toEqual([
      "2030-07-01T08",
      "2030-07-01T09",
      "2030-07-01T10",
    ]);
    expect(utcHourString(utcHourStartMs(hour))).toBe(hour);
  });
});
