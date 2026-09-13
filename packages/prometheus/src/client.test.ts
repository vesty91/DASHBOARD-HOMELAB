import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  executePrometheusQuery,
  fetchPrometheusOverview,
  prometheusContextFromIntegration,
  testPrometheusConnection,
} from "./client";
import { PrometheusError } from "./errors";
import { PROMETHEUS_QUERY_PATH, PROMETHEUS_QUERY_RANGE_PATH } from "./policy";
import { prometheusConfigSchema } from "./schemas";
import { prometheusAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const TOKEN = "PROM-BEARER-SUPER-SECRET";

function json(
  body: unknown,
  status = 200,
  extra: Partial<Extract<SecureHttpResult, { ok: true }>> = {},
): SecureHttpResult {
  return {
    ok: true,
    status,
    body: Buffer.from(typeof body === "string" ? body : JSON.stringify(body)),
    latencyMs: 3,
    ...extra,
  };
}

function vectorBody(value = "1"): unknown {
  return {
    status: "success",
    data: {
      resultType: "vector",
      result: [{ metric: { __name__: "up", job: "prometheus" }, value: [1_700_000_000, value] }],
    },
  };
}

function matrixBody(): unknown {
  return {
    status: "success",
    data: {
      resultType: "matrix",
      result: [
        {
          metric: { __name__: "up", job: "prometheus" },
          values: [
            [1_700_000_000, "1"],
            [1_700_000_060, "1"],
          ],
        },
      ],
    },
  };
}

function context(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  secrets: { bearerToken?: string } = { bearerToken: TOKEN },
) {
  return prometheusContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "http://prometheus.lab:9090/",
    config: prometheusConfigSchema.parse({
      verifyTls: true,
      timeoutMs: 8000,
    }),
    secrets,
    verifyTls: true,
    timeoutMs: 8000,
    request,
    now: () => 1_700_000_900_000,
  });
}

describe("prometheus client", () => {
  it("POSTs an instant query without PromQL or the token in the URL", async () => {
    const expected = prometheusAuthHeaders(TOKEN);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const url = new URL(String(options.url));
      expect(options.method).toBe("POST");
      expect(url.pathname).toBe(PROMETHEUS_QUERY_PATH);
      expect(url.search).toBe("");
      expect(url.toString()).not.toContain(TOKEN);
      expect(url.toString()).not.toContain("up");
      expect(options.body).toContain("query=up");
      expect(options.body).toContain("timeout=8s");
      expect(options.body).not.toContain("start=");
      expect(options.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      return json(vectorBody());
    });
    const overview = await fetchPrometheusOverview(context(request));
    expect(overview.resultType).toBe("vector");
    expect(overview.series[0]?.labels.__name__).toBe("up");
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
  });

  it("derives range start and end server-side", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const url = new URL(String(options.url));
      expect(url.pathname).toBe(PROMETHEUS_QUERY_RANGE_PATH);
      expect(url.search).toBe("");
      expect(options.body).toContain("start=1700000000");
      expect(options.body).toContain("end=1700000900");
      expect(options.body).toContain("step=60");
      return json(matrixBody());
    });
    const result = await executePrometheusQuery(context(request), {
      mode: "range",
      query: "up",
      rangeSeconds: 900,
      stepSeconds: 60,
    });
    expect(result.resultType).toBe("matrix");
    expect(result.sampleCount).toBe(2);
  });

  it("omits Authorization when no bearer token is configured", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBeUndefined();
      return json(vectorBody());
    });
    await testPrometheusConnection(context(request, {}));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("maps 401 without reflecting the token", async () => {
    const request = vi.fn(async () => json(`denied ${TOKEN}`, 401));
    await expect(testPrometheusConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("maps 403 without reflecting the token", async () => {
    const request = vi.fn(async () => json(`denied ${TOKEN}`, 403));
    await expect(testPrometheusConnection(context(request))).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
  });

  it("maps timeout, DNS, TLS and UNREACHABLE", async () => {
    await expect(
      testPrometheusConnection(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toBeInstanceOf(PrometheusError);
    await expect(
      fetchPrometheusOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchPrometheusOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchPrometheusOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("rejects invalid JSON and a truncated body", async () => {
    await expect(
      testPrometheusConnection(context(async () => json("not-json"))),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testPrometheusConnection(context(async () => json(vectorBody(), 200, { truncated: true }))),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects control characters in the bearer token before sending Authorization", () => {
    expect(() => prometheusAuthHeaders("abc\nInject")).toThrow(/control characters/);
  });
});
