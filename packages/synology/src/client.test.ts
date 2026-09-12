import { describe, expect, it } from "vitest";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";
import {
  fetchSynologyOverview,
  synologyContextFromIntegration,
  type SynologyRequestFn,
} from "./client";

function json(body: unknown): SecureHttpResult {
  return { ok: true, status: 200, body: Buffer.from(JSON.stringify(body)), latencyMs: 2 };
}

const API_INFO = {
  "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
  "SYNO.DSM.Info": { path: "entry.cgi", minVersion: 1, maxVersion: 2 },
  "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
  "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
  "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
};

function baseCtx(request: SynologyRequestFn) {
  return synologyContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://nas.example:5001/",
    verifyTls: true,
    timeoutMs: 8000,
    config: { account: "monitor", verifyTls: true, timeoutMs: 8000 },
    secrets: { password: "s3cret" },
    request,
  });
}

describe("Synology client session headers", () => {
  it("sends X-SYNO-TOKEN on DSM.Info and logout after Auth v6 login", async () => {
    const observed: Array<{ api: string | null; method: string; headers: Record<string, string> }> =
      [];
    const request = async (options: SecureHttpRequest): Promise<SecureHttpResult> => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      const headers = Object.fromEntries(
        Object.entries(options.headers ?? {}).map(([key, value]) => [key, String(value)]),
      );
      if (api === "SYNO.API.Info") return json({ success: true, data: API_INFO });
      if (options.method === "POST" && options.body?.includes("method=login"))
        return json({ success: true, data: { sid: "SID-123", synotoken: "TOKEN-456" } });
      observed.push({ api, method: options.method ?? "GET", headers });
      if (options.method === "POST" && options.body?.includes("method=logout"))
        return json({ success: true, data: {} });
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: { model: "DS920+", version_string: "DSM 7.2", ram: 8192 },
        });
      if (api === "SYNO.Core.System")
        return json({
          success: true,
          data: { cpu_cores: 4, cpu_family: "Intel", cpu_series: "J4125" },
        });
      if (api === "SYNO.Core.System.Utilization")
        return json({
          success: true,
          data: {
            cpu: { user_load: 1, system_load: 1, other_load: 0, idle_load: 98 },
            memory: { total_real: 4096, avail_real: 2048, real_usage: 50 },
          },
        });
      if (api === "SYNO.Storage.CGI.Storage")
        return json({ success: true, data: { volumes: [], disks: [] } });
      throw new Error(href);
    };

    const overview = await fetchSynologyOverview(baseCtx(request));
    expect(overview.system.data?.model).toBe("DS920+");

    const dsmInfo = observed.find((entry) => entry.api === "SYNO.DSM.Info");
    expect(dsmInfo).toBeDefined();
    expect(dsmInfo?.headers["X-SYNO-TOKEN"]).toBe("TOKEN-456");
    expect(Object.prototype.hasOwnProperty.call(dsmInfo?.headers ?? {}, "SynoToken")).toBe(false);

    const logout = observed.find(
      (entry) => entry.method === "POST" && entry.headers.cookie?.includes("id=SID-123"),
    );
    expect(logout).toBeDefined();
    expect(logout?.headers["X-SYNO-TOKEN"]).toBe("TOKEN-456");
    expect(Object.prototype.hasOwnProperty.call(logout?.headers ?? {}, "SynoToken")).toBe(false);
  });

  it("maps a disallowed Auth discovery path to INVALID_RESPONSE without calling it", async () => {
    const urls: string[] = [];
    const request = async (options: SecureHttpRequest): Promise<SecureHttpResult> => {
      const href = String(options.url);
      urls.push(href);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info")
        return json({
          success: true,
          data: {
            ...API_INFO,
            "SYNO.API.Auth": { path: "auth.cgi", minVersion: 3, maxVersion: 6 },
          },
        });
      throw new Error(`unexpected request ${href}`);
    };
    await expect(fetchSynologyOverview(baseCtx(request))).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    expect(urls.every((url) => !url.includes("auth.cgi"))).toBe(true);
    expect(urls.some((url) => url.includes("api=SYNO.API.Info"))).toBe(true);
  });

  it("marks system unavailable when DSM.Info uptime HH:MM:SS is out of range", async () => {
    const request = async (options: SecureHttpRequest): Promise<SecureHttpResult> => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json({ success: true, data: API_INFO });
      if (options.method === "POST" && options.body?.includes("method=login"))
        return json({ success: true, data: { sid: "SID-123", synotoken: "TOKEN-456" } });
      if (options.method === "POST" && options.body?.includes("method=logout"))
        return json({ success: true, data: {} });
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: { model: "DS920+", version_string: "DSM 7.2", uptime: "1:60:00", ram: 8192 },
        });
      if (api === "SYNO.Core.System.Utilization")
        return json({
          success: true,
          data: {
            cpu: { user_load: 1, system_load: 1, other_load: 0, idle_load: 98 },
            memory: { total_real: 4096, avail_real: 2048, real_usage: 50 },
          },
        });
      if (api === "SYNO.Storage.CGI.Storage")
        return json({ success: true, data: { volumes: [], disks: [] } });
      throw new Error(href);
    };
    const overview = await fetchSynologyOverview(baseCtx(request));
    expect(overview.system).toMatchObject({
      status: "unavailable",
      data: null,
      reason: "invalid-response",
    });
  });

  it("keeps DSM.Info available when only Core.System uptime is invalid", async () => {
    const request = async (options: SecureHttpRequest): Promise<SecureHttpResult> => {
      const href = String(options.url);
      const api = new URL(href).searchParams.get("api");
      if (api === "SYNO.API.Info") return json({ success: true, data: API_INFO });
      if (options.method === "POST" && options.body?.includes("method=login"))
        return json({ success: true, data: { sid: "SID-123", synotoken: "TOKEN-456" } });
      if (options.method === "POST" && options.body?.includes("method=logout"))
        return json({ success: true, data: {} });
      if (api === "SYNO.DSM.Info")
        return json({
          success: true,
          data: {
            model: "DS920+",
            version_string: "DSM 7.2",
            ram: 8192,
            temperature: 40,
          },
        });
      if (api === "SYNO.Core.System")
        return json({
          success: true,
          data: { cpu_cores: 4, cpu_family: "Intel", up_time: "0:00:99" },
        });
      if (api === "SYNO.Core.System.Utilization")
        return json({
          success: true,
          data: {
            cpu: { user_load: 1, system_load: 1, other_load: 0, idle_load: 98 },
            memory: { total_real: 4096, avail_real: 2048, real_usage: 50 },
          },
        });
      if (api === "SYNO.Storage.CGI.Storage")
        return json({ success: true, data: { volumes: [], disks: [] } });
      throw new Error(href);
    };
    const overview = await fetchSynologyOverview(baseCtx(request));
    expect(overview.system.status).toBe("degraded");
    expect(overview.system.data?.model).toBe("DS920+");
    expect(overview.system.data?.uptimeSeconds).toBeNull();
    expect(overview.system.reason).toBe("invalid-response");
  });
});
