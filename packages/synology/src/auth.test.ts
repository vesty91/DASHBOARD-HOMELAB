import { describe, expect, it, vi } from "vitest";
import type { SynologyRequestFn } from "./transport";
import { buildLoginRequest, buildLogoutRequest, login, sessionHeaders } from "./auth";
import { SYNOLOGY_DEVICE_NAME, SYNOLOGY_SESSION_NAME } from "./policy";

describe("DSM login response validation", () => {
  const ctx = { baseUrl: "https://nas.example:5001/", verifyTls: true, timeoutMs: 8000 };
  const input = { account: "monitor", password: "s3cret", authVersion: 6 };

  function requestReturning(data: unknown) {
    return vi.fn<SynologyRequestFn>().mockResolvedValue({
      ok: true,
      status: 200,
      body: Buffer.from(JSON.stringify({ success: true, data })),
      latencyMs: 1,
    });
  }

  it.each(["synotoken", "SynoToken"])(
    "preserves a valid %s in the session headers",
    async (field) => {
      const session = await login(
        requestReturning({ sid: "SID-123", [field]: "!TOKEN~" }),
        ctx,
        input,
      );
      expect(session.synoToken).toBe("!TOKEN~");
      expect(sessionHeaders(session)["X-SYNO-TOKEN"]).toBe("!TOKEN~");
    },
  );

  it("still supports DSM responses without a token", async () => {
    const session = await login(requestReturning({ sid: "SID-123" }), ctx, input);
    expect(session.synoToken).toBeUndefined();
    expect(sessionHeaders(session)).not.toHaveProperty("X-SYNO-TOKEN");
  });

  it.each(["synotoken", "SynoToken"])(
    "rejects unsafe %s before creating a session",
    async (field) => {
      for (const token of [
        "TOKEN\r",
        "TOKEN\n",
        "TOKEN\r\n",
        "TO\0KEN",
        "TO\tKEN",
        "TO KEN",
        "TOKEN\x7f",
      ]) {
        const request = requestReturning({ sid: "SID-123", [field]: token });
        await expect(login(request, ctx, input)).rejects.toMatchObject({
          kind: "INVALID_RESPONSE",
          message: "DSM login payload is invalid",
        });
        expect(request).toHaveBeenCalledTimes(1);
        expect(request.mock.calls[0]?.[0].headers).not.toHaveProperty("X-SYNO-TOKEN");
      }
    },
  );
});

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
