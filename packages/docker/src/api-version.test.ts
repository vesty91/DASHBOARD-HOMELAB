import { describe, expect, it } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  CLIENT_MAX_API,
  CLIENT_MIN_API,
  compareDockerApiVersions,
  negotiateDockerApiVersion,
  parseDockerApiVersion,
} from "./api-version";

describe("Docker API version", () => {
  it("parses 1.40 and 1.55 as tuples", () => {
    expect(parseDockerApiVersion("1.40")).toEqual({ major: 1, minor: 40 });
    expect(parseDockerApiVersion("1.55")).toEqual({ major: 1, minor: 55 });
    expect(CLIENT_MIN_API).toBe("1.40");
    expect(CLIENT_MAX_API).toBe("1.55");
    expect(compareDockerApiVersions({ major: 1, minor: 40 }, { major: 1, minor: 55 })).toBe(-1);
  });

  it("rejects malformed versions without float parsing", () => {
    for (const value of ["1", "1.x", "1.2.3", "NaN", "", "v1.55", "1.55.0"]) {
      expect(() => parseDockerApiVersion(value)).toThrow(IntegrationError);
    }
  });

  it("negotiates the overlapping supported version", () => {
    expect(
      negotiateDockerApiVersion({ serverApiVersion: "1.55", serverMinApiVersion: "1.40" }),
    ).toBe("1.55");
    expect(
      negotiateDockerApiVersion({ serverApiVersion: "1.50", serverMinApiVersion: "1.40" }),
    ).toBe("1.50");
    expect(
      negotiateDockerApiVersion({ serverApiVersion: "1.60", serverMinApiVersion: "1.24" }),
    ).toBe("1.55");
    expect(negotiateDockerApiVersion({ serverApiVersion: "1.55" })).toBe("1.55");
  });

  it("rejects engines without overlap", () => {
    expect(() =>
      negotiateDockerApiVersion({ serverApiVersion: "1.39", serverMinApiVersion: "1.12" }),
    ).toThrow(/below the client minimum/);
    expect(() =>
      negotiateDockerApiVersion({ serverApiVersion: "1.60", serverMinApiVersion: "1.56" }),
    ).toThrow(/overlapping/);
  });
});
