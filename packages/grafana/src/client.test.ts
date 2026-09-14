import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  fetchGrafanaOverview,
  grafanaContextFromIntegration,
  testGrafanaConnection,
} from "./client";
import { GrafanaError } from "./errors";
import { grafanaConfigSchema } from "./schemas";
import { grafanaAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const TOKEN = "glsa_abcdefghijklmnop0123456789ABCDEF";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return grafanaContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://grafana.lab:3000/",
    config: grafanaConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { serviceAccountToken: TOKEN },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/api/health")
    return json({ commit: "deadbeef", database: "ok", version: "11.2.0" });
  if (url.pathname === "/api/search") {
    expect(url.searchParams.get("type")).toBe("dash-db");
    expect(url.searchParams.get("limit")).toBe("100");
    return json([
      { title: "Secret dashboard", url: "/d/abc/secret-dashboard", type: "dash-db" },
      { title: "Other", url: "/d/def/other", type: "dash-db" },
    ]);
  }
  if (url.pathname === "/api/folders") {
    expect(url.searchParams.get("limit")).toBe("100");
    return json([{ title: "Private folder", uid: "fold" }]);
  }
  if (url.pathname === "/api/prometheus/grafana/api/v1/alerts")
    return json({
      status: "success",
      data: {
        alerts: [
          {
            labels: { alertname: "InstanceDown" },
            annotations: { description: "host down" },
            state: "firing",
          },
          { state: "pending" },
        ],
      },
    });
  return json([
    {
      name: "Prometheus",
      type: "prometheus",
      url: "http://prometheus.internal:9090",
      password: TOKEN,
      user: "admin",
      database: "metrics",
      basicAuthPassword: "basic",
      secureJsonData: { token: TOKEN },
      jsonData: { httpMethod: "POST" },
    },
  ]);
}

describe("grafana client", () => {
  it("sends Bearer auth and never puts the token in the URL", async () => {
    const expected = grafanaAuthHeaders(TOKEN);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(TOKEN);
      expect(url.searchParams.has("token")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      return officialPayloads(options);
    });
    const result = await testGrafanaConnection(context(request));
    expect(result).toEqual({ version: "11.2.0", database: "ok" });
  });

  it("maps 401 to unauthorized and never reflects the token", async () => {
    const request = vi.fn(async () => json({ message: `bad ${TOKEN}` }, 401));
    await expect(testGrafanaConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and unreachable", async () => {
    await expect(testGrafanaConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      GrafanaError,
    );
    await expect(
      fetchGrafanaOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchGrafanaOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchGrafanaOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchGrafanaOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when alerts are forbidden and never fakes counts", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/prometheus/grafana/api/v1/alerts")
        return json({}, 403);
      return officialPayloads(options);
    });
    const overview = await fetchGrafanaOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.health.status).toBe("available");
    expect(overview.dashboards.data?.count).toBe(2);
    expect(overview.alerts.status).toBe("unavailable");
    expect(overview.alerts.data).toBeNull();
    expect(overview.alerts.reason).toBe("permission-denied");
    expect(JSON.stringify(overview)).not.toContain("Secret dashboard");
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
    expect(JSON.stringify(overview)).not.toContain("InstanceDown");
  });

  it("marks alerts unavailable on 404 without inventing zeros", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/prometheus/grafana/api/v1/alerts")
        return json({}, 404);
      return officialPayloads(options);
    });
    const overview = await fetchGrafanaOverview(context(request));
    expect(overview.alerts).toEqual({
      status: "unavailable",
      data: null,
      reason: "api-unavailable",
    });
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testGrafanaConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testGrafanaConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ database: "ok", version: "11" })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
