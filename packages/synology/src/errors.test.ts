import { describe, expect, it } from "vitest";
import { isRetryableSessionError, mapDsmErrorCode, toIntegrationError } from "./errors";

describe("DSM error mapping", () => {
  it("maps auth and session codes without retrying credential failures", () => {
    expect(toIntegrationError(mapDsmErrorCode(400)).code).toBe("UNAUTHORIZED");
    expect(toIntegrationError(mapDsmErrorCode(403)).code).toBe("MISCONFIGURED");
    expect(toIntegrationError(mapDsmErrorCode(404)).code).toBe("UNAUTHORIZED");
    expect(toIntegrationError(mapDsmErrorCode(105)).code).toBe("FORBIDDEN");
    expect(isRetryableSessionError(mapDsmErrorCode(106))).toBe(true);
    expect(isRetryableSessionError(mapDsmErrorCode(107))).toBe(true);
    expect(isRetryableSessionError(mapDsmErrorCode(119))).toBe(true);
    expect(isRetryableSessionError(mapDsmErrorCode(400))).toBe(false);
    expect(isRetryableSessionError(mapDsmErrorCode(401))).toBe(false);
    expect(isRetryableSessionError(mapDsmErrorCode(403))).toBe(false);
  });
});
