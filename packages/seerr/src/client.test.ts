import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { fetchSeerrOverview, seerrContextFromIntegration, testSeerrConnection } from "./client";
import { SeerrError } from "./errors";
import { seerrConfigSchema } from "./schemas";
import { seerrAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const KEY = "notareal-seerr-apikey-0123456789";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return seerrContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://seerr.lab:5055/",
    config: seerrConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiKey: KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/api/v1/status")
    return json({
      version: "2.5.0",
      commitTag: "abc123",
      updateAvailable: false,
      commitsBehind: 0,
      restartRequired: false,
    });
  return json({
    pending: 2,
    approved: 5,
    processing: 1,
    available: 8,
    movie: 9,
    tv: 7,
    declined: 3,
    completed: 4,
    total: 16,
  });
}

describe("seerr client", () => {
  it("sends X-Api-Key auth and never puts the key in the URL", async () => {
    const expected = seerrAuthHeaders(KEY);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.["X-Api-Key"]).toBe(expected["X-Api-Key"]);
      expect(options.headers?.Accept).toBe("application/json");
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(KEY);
      expect(url.searchParams.has("apikey")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      return officialPayloads(options);
    });
    const result = await testSeerrConnection(context(request));
    expect(result).toEqual({ version: "2.5.0", compatibleProduct: "seerr-family" });
  });

  it("maps 401 and 403 on status to unauthorized or forbidden", async () => {
    const request = vi.fn(async () => json({ message: `bad ${KEY}` }, 401));
    await expect(testSeerrConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
    const overviewRequest = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v1/status")
        return json({ message: `bad ${KEY}` }, 401);
      return officialPayloads(options);
    });
    await expect(fetchSeerrOverview(context(overviewRequest))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(testSeerrConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      SeerrError,
    );
    const forbiddenStatus = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v1/status") return json({}, 403);
      return officialPayloads(options);
    });
    await expect(fetchSeerrOverview(context(forbiddenStatus))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("maps timeout, DNS, TLS and unreachable", async () => {
    await expect(
      fetchSeerrOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchSeerrOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchSeerrOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchSeerrOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when request/count is forbidden and never invents zeros", async () => {
    for (const status of [403, 404] as const) {
      const request = vi.fn(async (options: SecureHttpRequest) => {
        if (new URL(String(options.url)).pathname === "/api/v1/request/count")
          return json({}, status);
        return officialPayloads(options);
      });
      const overview = await fetchSeerrOverview(context(request));
      expect(overview.status).toBe("degraded");
      expect(overview.system.data?.version).toBe("2.5.0");
      expect(overview.counts.status).toBe("unavailable");
      expect(overview.counts.data).toBeNull();
      expect(JSON.stringify(overview)).not.toContain("Dune");
      expect(JSON.stringify(overview)).not.toContain(KEY);
      expect(JSON.stringify(overview)).not.toMatch(/"pending":0/u);
    }
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testSeerrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testSeerrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ version: "2.5.0" })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
