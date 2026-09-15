import { describe, expect, it } from "vitest";
import {
  isSeerrRequestActionPath,
  seerrRequestActionPath,
  seerrRequestAuditAction,
  seerrRequestResourceId,
} from "./request-action";

describe("seerr request action allowlist", () => {
  it("builds official approve and decline paths for a single request id", () => {
    expect(seerrRequestActionPath(12, "approve")).toBe("/api/v1/request/12/approve");
    expect(seerrRequestActionPath(12, "decline")).toBe("/api/v1/request/12/decline");
    expect(seerrRequestResourceId(12)).toBe("request:12");
    expect(seerrRequestAuditAction("approve")).toBe("seerr.approve");
    expect(seerrRequestAuditAction("decline")).toBe("seerr.decline");
    expect(isSeerrRequestActionPath("/api/v1/request/12/approve")).toBe(true);
    expect(isSeerrRequestActionPath("/api/v1/request/12/decline")).toBe(true);
  });

  it("rejects pending, retry, delete, list and malformed ids", () => {
    expect(isSeerrRequestActionPath("/api/v1/request/12/pending")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/request/12/retry")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/request")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/request/12")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/request/012/approve")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/request/0/approve")).toBe(false);
    expect(isSeerrRequestActionPath("/api/v1/user/12/approve")).toBe(false);
    expect(() => seerrRequestActionPath(0, "approve")).toThrow(/request id/);
    expect(() => seerrRequestActionPath(-1, "decline")).toThrow(/request id/);
    expect(() => seerrRequestActionPath(2_147_483_648, "approve")).toThrow(/request id/);
  });
});
