import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { mapCounts, mapStatus, parseJsonValue } from "./dto";

const KEY = "notareal-seerr-apikey-0123456789";

const seerrStatus = {
  version: "2.5.0",
  commitTag: "abc123",
  updateAvailable: false,
  commitsBehind: 0,
  restartRequired: false,
};

const jellyseerrStatus = {
  version: "2.1.0",
  commitTag: "jellyseerr-local",
  updateAvailable: true,
  commitsBehind: 3,
  restartRequired: false,
};

const overseerrStatus = {
  version: "1.34.0",
  commitTag: "overseerr",
  updateAvailable: false,
  commitsBehind: 0,
  restartRequired: false,
};

const seerrCounts = {
  pending: 2,
  approved: 5,
  processing: 1,
  available: 8,
  movie: 9,
  tv: 7,
  declined: 3,
  completed: 4,
  total: 16,
};

const jellyseerrCounts = {
  pending: 0,
  approved: 1,
  processing: 0,
  available: 4,
  movie: 3,
  tv: 2,
  declined: 1,
  completed: 2,
};

const overseerrCounts = {
  pending: 7,
  approved: 0,
  processing: 2,
  available: 11,
  total: 20,
};

describe("seerr dto", () => {
  it("maps Seerr, Jellyseerr and Overseerr status with one family product", () => {
    expect(mapStatus(seerrStatus, [KEY])).toEqual({
      version: "2.5.0",
      compatibleProduct: "seerr-family",
    });
    expect(mapStatus(jellyseerrStatus, [KEY])).toEqual({
      version: "2.1.0",
      compatibleProduct: "seerr-family",
    });
    expect(mapStatus(overseerrStatus, [KEY])).toEqual({
      version: "1.34.0",
      compatibleProduct: "seerr-family",
    });
    expect(JSON.stringify(mapStatus(seerrStatus, [KEY]))).not.toContain("commitTag");
    expect(JSON.stringify(mapStatus(jellyseerrStatus, [KEY]))).not.toContain("jellyseerr");
    expect(JSON.stringify(mapStatus(overseerrStatus, [KEY]))).not.toContain("overseerr");
    expect(mapStatus({ version: KEY }, [KEY])).toEqual({
      version: "[REDACTED]",
      compatibleProduct: "seerr-family",
    });
    expect(mapStatus({ version: "bad\nver" }, [KEY])).toEqual({ version: null });
  });

  it("maps request counts from all three products without titles or names", () => {
    expect(mapCounts(seerrCounts)).toEqual({
      pending: 2,
      approved: 5,
      processing: 1,
      available: 8,
      total: 16,
    });
    expect(mapCounts(jellyseerrCounts)).toEqual({
      pending: 0,
      approved: 1,
      processing: 0,
      available: 4,
    });
    expect(mapCounts(overseerrCounts)).toEqual({
      pending: 7,
      approved: 0,
      processing: 2,
      available: 11,
      total: 20,
    });
    expect(JSON.stringify(mapCounts(seerrCounts))).not.toContain("movie");
    expect(JSON.stringify(mapCounts(seerrCounts))).not.toContain("declined");
    expect(JSON.stringify(mapCounts(seerrCounts))).not.toContain("Dune");
  });

  it("rejects malformed status and counts", () => {
    expect(() => mapStatus([], [KEY])).toThrow(IntegrationError);
    expect(() => mapStatus("2.5.0", [KEY])).toThrow(IntegrationError);
    expect(() => mapCounts([])).toThrow(IntegrationError);
    expect(() => mapCounts({ pending: -1, approved: 0, processing: 0, available: 0 })).toThrow(
      IntegrationError,
    );
    expect(() => mapCounts({ approved: 1, processing: 0, available: 0 })).toThrow(IntegrationError);
    expect(() => parseJsonValue("{")).toThrow(/invalid JSON/);
  });
});
