import { describe, expect, it } from "vitest";
import { TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { INFO_QUERY } from "./policy";
import { synologyIntegrationDefinition } from "./definition";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

function json(body: unknown) {
  return { ok: true as const, status: 200, body: Buffer.from(JSON.stringify(body)), latencyMs: 2 };
}

const DEFAULT_API_INFO = {
  "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
  "SYNO.DSM.Info": { path: "entry.cgi", minVersion: 1, maxVersion: 2 },
  "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
  "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
  "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
};

function mockDsmTransport(
  options: { url: URL | string; method?: string; body?: string },
  responses: Record<string, ReturnType<typeof json>> = {},
  infoData: Record<string, unknown> = DEFAULT_API_INFO,
) {
  const href = String(options.url);
  const api = new URL(href).searchParams.get("api");
  if (api === "SYNO.API.Info") return json({ success: true, data: infoData });
  if (options.method === "POST") {
    if (options.body?.includes("method=login"))
      return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
    return json({ success: true, data: {} });
  }
  if (api && responses[api]) return responses[api];
  throw new Error(href);
}

describe("Synology integration definition", () => {
  it("declares account in config, password as a secret, and deviceId as server-managed", () => {
    expect(synologyIntegrationDefinition.id).toBe("synology");
    expect(synologyIntegrationDefinition.displayName).toBe("Synology DSM");
    expect(synologyIntegrationDefinition.version).toBe(1);
    expect(synologyIntegrationDefinition.capabilities).toEqual([
      "system.read",
      "resources.read",
      "storage.read",
    ]);
    expect(synologyIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "password",
      "deviceId",
    ]);
    expect(synologyIntegrationDefinition.secretFields[1]?.serverManaged).toBe(true);
    expect(
      synologyIntegrationDefinition.configFields.some((field) => field.key === "account"),
    ).toBe(true);
    expect(
      synologyIntegrationDefinition.configFields.some((field) => field.key === "trustedCaPem"),
    ).toBe(true);
  });

  it("tests the connection through entry.cgi only and forwards trustedCaPem", async () => {
    const seenCa: Array<string | undefined> = [];
    const urls: string[] = [];
    const methods: string[] = [];
    const result = await synologyIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "https://nas.example:5001/",
      verifyTls: true,
      timeoutMs: 8000,
      config: {
        account: "monitor",
        verifyTls: true,
        timeoutMs: 8000,
        trustedCaPem: TEST_TRUSTED_CA_PEM,
      },
      secrets: { password: "s3cret" },
      request: async (options) => {
        seenCa.push(options.trustedCaPem);
        const href = String(options.url);
        urls.push(href);
        methods.push(options.method ?? "GET");
        expect(href).not.toMatch(/passwd|s3cret|monitor/u);
        expect(href).toContain("/webapi/entry.cgi");
        expect(href).not.toContain("/webapi/query.cgi");
        expect(href).not.toContain("/webapi/auth.cgi");
        const api = new URL(href).searchParams.get("api");
        if (api === "SYNO.API.Info") {
          expect(new URL(href).searchParams.get("query")).toBe(INFO_QUERY);
          return json({
            success: true,
            data: {
              "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
              "SYNO.DSM.Info": { path: "entry.cgi", minVersion: 1, maxVersion: 2 },
              "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
              "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
              "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
            },
          });
        }
        if (options.method === "POST") {
          expect(options.body).not.toContain(INFO_QUERY);
          if (options.body?.includes("method=login")) {
            expect(options.body).toContain("passwd=");
            expect(options.body).toContain("account=monitor");
            expect(options.body).toContain("session=DashboardHomelab");
            return json({ success: true, data: { sid: "SIDTOKEN", synotoken: "TOK" } });
          }
          expect(options.body).not.toContain("passwd=");
          expect(options.body).toContain("method=logout");
          return json({ success: true, data: {} });
        }
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
              cpu: { user_load: 4, system_load: 1, other_load: 0, idle_load: 95 },
              memory: { total_real: 2048, avail_real: 1024, real_usage: 50 },
            },
          });
        if (api === "SYNO.Storage.CGI.Storage")
          return json({
            success: true,
            data: { volumes: [], disks: [] },
          });
        throw new Error(href);
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metadata).toMatchObject({
        model: "DS920+",
        dsmVersion: "DSM 7.2",
      });
      expect(JSON.stringify(result.metadata)).not.toMatch(/SIDTOKEN|s3cret|passwd|serial/u);
    }
    expect(seenCa.every((value) => value === TEST_TRUSTED_CA_PEM)).toBe(true);
    expect(urls.every((value) => value.includes("/webapi/entry.cgi"))).toBe(true);
    expect(methods.includes("POST")).toBe(true);
  });

  it("fails the connection test when DSM.Info is forbidden after login", async () => {
    const result = await synologyIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "https://nas.example:5001/",
      verifyTls: true,
      timeoutMs: 8000,
      config: { account: "monitor", verifyTls: true, timeoutMs: 8000 },
      secrets: { password: "s3cret" },
      request: async (options) =>
        mockDsmTransport(options, {
          "SYNO.DSM.Info": json({ success: false, error: { code: 105 } }),
        }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("FORBIDDEN");
  });

  it("fails the connection test when DSM.Info is missing from discovery", async () => {
    const result = await synologyIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "https://nas.example:5001/",
      verifyTls: true,
      timeoutMs: 8000,
      config: { account: "monitor", verifyTls: true, timeoutMs: 8000 },
      secrets: { password: "s3cret" },
      request: async (options) =>
        mockDsmTransport(
          options,
          {},
          {
            "SYNO.API.Auth": { path: "entry.cgi", minVersion: 3, maxVersion: 6 },
            "SYNO.Core.System": { path: "entry.cgi", minVersion: 1, maxVersion: 3 },
            "SYNO.Core.System.Utilization": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
            "SYNO.Storage.CGI.Storage": { path: "entry.cgi", minVersion: 1, maxVersion: 1 },
          },
        ),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });
});
