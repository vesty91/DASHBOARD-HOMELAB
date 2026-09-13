import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  fetchUptimeKumaOverview,
  testUptimeKumaConnection,
  uptimeKumaContextFromIntegration,
} from "./client";
import { UptimeKumaError } from "./errors";
import { uptimeKumaConfigSchema } from "./schemas";
import { uptimeKumaAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const API_KEY = "UK-API-SUPER-SECRET";

function text(
  body: string,
  status = 200,
  extra: Partial<Extract<SecureHttpResult, { ok: true }>> = {},
): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(body), latencyMs: 3, ...extra };
}

function officialMetrics(): string {
  return [
    "# HELP monitor_status Monitor Status (1 = UP, 0= DOWN, 2= PENDING, 3= MAINTENANCE)",
    "# TYPE monitor_status gauge",
    'monitor_status{monitor_id="1",monitor_name="Web",monitor_type="http",monitor_url="https://web.lab",monitor_hostname="web.lab",monitor_port="443"} 1',
    "# HELP monitor_response_time Monitor Response Time (ms)",
    "# TYPE monitor_response_time gauge",
    'monitor_response_time{monitor_id="1",monitor_name="Web",monitor_type="http",monitor_url="https://web.lab",monitor_hostname="web.lab",monitor_port="443"} 12',
    "# HELP monitor_uptime_ratio Uptime ratio (0.0 - 1.0)",
    "# TYPE monitor_uptime_ratio gauge",
    'monitor_uptime_ratio{monitor_id="1",monitor_name="Web",monitor_type="http",monitor_url="https://web.lab",monitor_hostname="web.lab",monitor_port="443",window="1d"} 1',
  ].join("\n");
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return uptimeKumaContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://uptime.lab/",
    config: uptimeKumaConfigSchema.parse({
      verifyTls: true,
      timeoutMs: 8000,
    }),
    secrets: { apiKey: API_KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

describe("uptime-kuma client", () => {
  it("authenticates with Basic empty-user and never puts the API key in the URL", async () => {
    const expected = uptimeKumaAuthHeaders(API_KEY);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const url = new URL(String(options.url));
      expect(url.pathname).toBe("/metrics");
      expect(url.search).toBe("");
      expect(url.toString()).not.toContain(API_KEY);
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      return text(officialMetrics());
    });
    const overview = await fetchUptimeKumaOverview(context(request));
    expect(overview.status).toBe("available");
    expect(overview.monitors.data?.upCount).toBe(1);
    expect(JSON.stringify(overview)).not.toContain(API_KEY);
    expect(JSON.stringify(overview)).not.toContain("web.lab");
  });

  it("maps 401 without reflecting the API key", async () => {
    const request = vi.fn(async () => text(`bad ${API_KEY}`, 401));
    await expect(testUptimeKumaConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and UNREACHABLE", async () => {
    await expect(
      testUptimeKumaConnection(context(async () => text("", 403))),
    ).rejects.toMatchObject({ kind: "FORBIDDEN" });
    await expect(
      testUptimeKumaConnection(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toBeInstanceOf(UptimeKumaError);
    await expect(
      fetchUptimeKumaOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchUptimeKumaOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchUptimeKumaOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("rejects invalid and oversized metrics bodies", async () => {
    await expect(
      testUptimeKumaConnection(
        context(async () => text('monitor_status{monitor_id="1"} not-a-number')),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testUptimeKumaConnection(
        context(async () => ({
          ok: false as const,
          code: "INVALID_RESPONSE" as const,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(
      testUptimeKumaConnection(
        context(async () => text(officialMetrics(), 200, { truncated: true })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects control characters in the API key before sending Authorization", () => {
    expect(() => uptimeKumaAuthHeaders("abc\nInject")).toThrow(/control characters/);
  });

  it("marks down or pending monitors as degraded without hiding them", async () => {
    const request = vi.fn(async () => text('monitor_status{monitor_id="1",monitor_name="Web"} 0'));
    const overview = await fetchUptimeKumaOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.monitors.data?.downCount).toBe(1);
    expect(overview.monitors.data?.monitors[0]?.status).toBe("down");
  });

  it("keeps maintenance-only overviews available", async () => {
    const request = vi.fn(async () => text('monitor_status{monitor_id="1",monitor_name="Web"} 3'));
    const overview = await fetchUptimeKumaOverview(context(request));
    expect(overview.status).toBe("available");
    expect(overview.monitors.data?.maintenanceCount).toBe(1);
  });
});
