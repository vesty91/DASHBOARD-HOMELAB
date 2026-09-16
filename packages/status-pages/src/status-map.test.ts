import { describe, expect, it } from "vitest";
import {
  mapIntegrationStatusToPublic,
  pickOverallStatus,
  resolvePublicServiceStatus,
} from "./status-map";

describe("status mapping", () => {
  it("maps IntegrationStatus explicitly", () => {
    expect(mapIntegrationStatusToPublic("available")).toBe("operational");
    expect(mapIntegrationStatusToPublic("unavailable")).toBe("outage");
    expect(mapIntegrationStatusToPublic("unknown")).toBe("unknown");
  });

  it("elevates open availability incidents to outage", () => {
    expect(
      resolvePublicServiceStatus({
        integrationStatus: "available",
        hasOpenAvailabilityIncident: true,
        hasActiveMaintenance: false,
      }),
    ).toBe("outage");
  });

  it("prefers maintenance display when healthy and under active maintenance", () => {
    expect(
      resolvePublicServiceStatus({
        integrationStatus: "available",
        hasOpenAvailabilityIncident: false,
        hasActiveMaintenance: true,
      }),
    ).toBe("maintenance");
  });

  it("keeps outage when unavailable even during maintenance", () => {
    expect(
      resolvePublicServiceStatus({
        integrationStatus: "unavailable",
        hasOpenAvailabilityIncident: false,
        hasActiveMaintenance: true,
      }),
    ).toBe("outage");
  });

  it("returns unknown for missing sources", () => {
    expect(
      resolvePublicServiceStatus({
        integrationStatus: null,
        hasOpenAvailabilityIncident: false,
        hasActiveMaintenance: false,
      }),
    ).toBe("unknown");
  });

  it("applies overall priority outage > degraded > maintenance > unknown > operational", () => {
    expect(pickOverallStatus(["operational", "unknown"])).toBe("unknown");
    expect(pickOverallStatus(["unknown", "maintenance"])).toBe("maintenance");
    expect(pickOverallStatus(["maintenance", "degraded"])).toBe("degraded");
    expect(pickOverallStatus(["degraded", "outage"])).toBe("outage");
    expect(pickOverallStatus([])).toBe("unknown");
  });
});
