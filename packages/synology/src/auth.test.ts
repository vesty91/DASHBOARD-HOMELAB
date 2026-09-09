import { describe, expect, it } from "vitest";
import { buildLoginRequest, buildLogoutRequest, sessionHeaders } from "./auth";
import { SYNOLOGY_DEVICE_NAME, SYNOLOGY_SESSION_NAME } from "./policy";

describe("DSM auth request bodies", () => {
  it("sends credentials in the POST body with session DashboardHomelab", () => {
    const v6 = buildLoginRequest({
      account: "monitor",
      password: "s3cret",
      authVersion: 6,
    });
    const params = new URLSearchParams(v6);
    expect(params.get("account")).toBe("monitor");
    expect(params.get("passwd")).toBe("s3cret");
    expect(params.get("session")).toBe(SYNOLOGY_SESSION_NAME);
    expect(params.get("format")).toBe("sid");
    expect(params.get("enable_syno_token")).toBe("yes");
    expect(params.get("method")).toBe("login");
    const v3 = new URLSearchParams(
      buildLoginRequest({ account: "monitor", password: "s3cret", authVersion: 3 }),
    );
    expect(v3.get("enable_syno_token")).toBeNull();
  });

  it("enrolls a trusted device without putting OTP in a query string helper", () => {
    const body = buildLoginRequest({
      account: "monitor",
      password: "s3cret",
      authVersion: 6,
      otpCode: "654321",
      enableDeviceToken: true,
    });
    const params = new URLSearchParams(body);
    expect(params.get("otp_code")).toBe("654321");
    expect(params.get("enable_device_token")).toBe("yes");
    expect(params.get("device_name")).toBe(SYNOLOGY_DEVICE_NAME);
    expect(buildLogoutRequest(6)).toContain("method=logout");
    expect(buildLogoutRequest(6)).not.toContain("passwd=");
  });
});

describe("sessionHeaders", () => {
  it("sends the DSM CSRF token under X-SYNO-TOKEN and never SynoToken", () => {
    const headers = sessionHeaders({
      sid: "SID-123",
      synoToken: "TOKEN-456",
      authVersion: 6,
    });
    expect(headers.cookie).toBe("id=SID-123");
    expect(headers["X-SYNO-TOKEN"]).toBe("TOKEN-456");
    expect(Object.prototype.hasOwnProperty.call(headers, "SynoToken")).toBe(false);
  });

  it("omits CSRF headers when the session has no synoToken", () => {
    const headers = sessionHeaders({
      sid: "SID-123",
      synoToken: undefined,
      authVersion: 3,
    });
    expect(headers.cookie).toBe("id=SID-123");
    expect(Object.prototype.hasOwnProperty.call(headers, "X-SYNO-TOKEN")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(headers, "SynoToken")).toBe(false);
  });
});
