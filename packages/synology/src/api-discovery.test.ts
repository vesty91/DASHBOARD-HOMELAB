import { describe, expect, it } from "vitest";
import { negotiateVersion, parseDiscoveredApis } from "./api-discovery";
import { SynologyError, toIntegrationError } from "./errors";

const baseApis = {
  "SYNO.DSM.Info": { path: "entry.cgi", minVersion: 1, maxVersion: 2 },
  "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
  "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
  "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
};

describe("DSM API discovery", () => {
  it("prefers Auth v6 when the overlap allows it", () => {
    expect(negotiateVersion(1, 6, 3, 6)).toBe(6);
    expect(negotiateVersion(3, 4, 3, 6)).toBe(4);
    expect(negotiateVersion(7, 8, 3, 6)).toBeNull();
  });

  it("marks non-entry.cgi paths as invalid instead of calling them", () => {
    const discovered = parseDiscoveredApis({
      "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
      "SYNO.DSM.Info": { path: "query.cgi", minVersion: 1, maxVersion: 2 },
      "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
      "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
      "SYNO.Storage.CGI.Storage": { path: "FileStation.cgi", minVersion: 1, maxVersion: 1 },
    });
    expect(discovered.auth.version).toBe(6);
    expect(discovered.dsmInfo).toMatchObject({ available: false, reason: "invalid-response" });
    expect(discovered.storage).toMatchObject({ available: false, reason: "invalid-response" });
    expect(discovered.system.available).toBe(true);
  });

  it("rejects a disallowed Auth CGI path as INVALID_RESPONSE", () => {
    expect(() =>
      parseDiscoveredApis({
        "SYNO.API.Auth": { path: "auth.cgi", minVersion: 3, maxVersion: 6 },
        ...baseApis,
      }),
    ).toThrow(SynologyError);
    try {
      parseDiscoveredApis({
        "SYNO.API.Auth": { path: "auth.cgi", minVersion: 3, maxVersion: 6 },
        ...baseApis,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SynologyError);
      expect((error as SynologyError).kind).toBe("INVALID_RESPONSE");
      expect(toIntegrationError(error as SynologyError).code).toBe("INVALID_RESPONSE");
    }
  });

  it("maps a missing Auth API to API_UNAVAILABLE / NOT_FOUND", () => {
    try {
      parseDiscoveredApis({ ...baseApis });
      throw new Error("expected SynologyError");
    } catch (error) {
      expect(error).toBeInstanceOf(SynologyError);
      expect((error as SynologyError).kind).toBe("API_UNAVAILABLE");
      expect(toIntegrationError(error as SynologyError).code).toBe("NOT_FOUND");
    }
  });

  it("maps an unsupported Auth version range to UNSUPPORTED_VERSION", () => {
    try {
      parseDiscoveredApis({
        "SYNO.API.Auth": { path: "entry.cgi", minVersion: 7, maxVersion: 8 },
        ...baseApis,
      });
      throw new Error("expected SynologyError");
    } catch (error) {
      expect(error).toBeInstanceOf(SynologyError);
      expect((error as SynologyError).kind).toBe("UNSUPPORTED_VERSION");
      expect(toIntegrationError(error as SynologyError).code).toBe("UNSUPPORTED_VERSION");
    }
  });
});
