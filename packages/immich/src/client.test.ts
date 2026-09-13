import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { fetchImmichOverview, immichContextFromIntegration, testImmichConnection } from "./client";
import { immichConfigSchema } from "./schemas";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const API_KEY = "IM-API-KEY-SECRET";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return immichContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://immich.lab/",
    config: immichConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiKey: API_KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function official(pathname: string): SecureHttpResult {
  switch (pathname) {
    case "/api/server/version":
      return json({ major: 1, minor: 142, patch: 3, prerelease: null });
    case "/api/server/about":
      return json({ version: "v1.142.3", licensed: true });
    case "/api/server/ping":
      return json({ res: "pong" });
    case "/api/server/storage":
      return json({
        diskSizeRaw: 1000,
        diskUseRaw: 200,
        diskAvailableRaw: 800,
        diskUsagePercentage: 20,
      });
    case "/api/server/statistics":
      return json({ photos: 10, videos: 2, usage: 300 });
    default:
      return json({}, 404);
  }
}

describe("immich client", () => {
  it("sends x-api-key and never puts the API key in the URL", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.["x-api-key"]).toBe(API_KEY);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(API_KEY);
      expect(url.searchParams.has("apiKey")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      return official(url.pathname);
    });
    const result = await testImmichConnection(context(request));
    expect(result.version).toBe("1.142.3");
  });

  it("maps 401 to unauthorized without reflecting the API key", async () => {
    const request = vi.fn(async () => json({ message: `bad ${API_KEY}` }, 401));
    await expect(testImmichConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("returns a degraded overview when only statistics fail", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/server/statistics")
        return { ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 };
      return official(pathname);
    });
    const overview = await fetchImmichOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.stats.status).toBe("unavailable");
    expect(overview.stats.reason).toBe("timeout");
    expect(overview.health.data?.ok).toBe(true);
  });

  it("preserves DNS errors when every section fails", async () => {
    const request = vi.fn(async () => ({
      ok: false as const,
      code: "DNS_ERROR" as const,
      latencyMs: 2,
    }));
    await expect(fetchImmichOverview(context(request))).rejects.toMatchObject({
      code: "DNS_ERROR",
    });
  });

  it("rejects invalid JSON", async () => {
    const request = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      body: Buffer.from("{"),
      latencyMs: 1,
    }));
    await expect(testImmichConnection(context(request))).rejects.toBeInstanceOf(IntegrationError);
  });

  it("maps 403 and 429 without reflecting the API key", async () => {
    const forbidden = vi.fn(async () => json({ message: `denied ${API_KEY}` }, 403));
    await expect(testImmichConnection(context(forbidden))).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
    const limited = vi.fn(async () => json({ message: `slow ${API_KEY}` }, 429));
    await expect(testImmichConnection(context(limited))).rejects.toMatchObject({
      kind: "RATE_LIMITED",
    });
  });
});
