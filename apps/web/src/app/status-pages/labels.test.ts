import { describe, expect, it } from "vitest";
import { pickOverallStatus } from "@dashboard/status-pages";
import { PUBLIC_STATUS_LABELS, isoToUtcLocalInput, utcLocalInputToIso } from "./labels";

describe("status page labels", () => {
  it("exposes text labels for every public status", () => {
    expect(PUBLIC_STATUS_LABELS.operational).toMatch(/Opérationnel/i);
    expect(PUBLIC_STATUS_LABELS.outage).toMatch(/Panne/i);
    expect(PUBLIC_STATUS_LABELS.maintenance).toMatch(/Maintenance/i);
  });

  it("keeps overall priority deterministic", () => {
    expect(pickOverallStatus(["operational", "maintenance", "unknown"])).toBe("maintenance");
    expect(pickOverallStatus(["degraded", "outage", "maintenance"])).toBe("outage");
  });

  it("round-trips UTC local datetime inputs", () => {
    const iso = utcLocalInputToIso("2030-01-15T12:30");
    expect(iso).toBe("2030-01-15T12:30:00.000Z");
    expect(isoToUtcLocalInput(iso)).toBe("2030-01-15T12:30");
  });
});
