import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  fetchProwlarrOverview,
  prowlarrContextFromIntegration,
  testProwlarrConnection,
} from "./client";
import { ProwlarrError } from "./errors";
import { prowlarrConfigSchema } from "./schemas";
import { prowlarrAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const KEY = "notareal-prowlarr-apikey-0123456789";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return prowlarrContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://prowlarr.lab:9696/",
    config: prowlarrConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiKey: KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/api/v1/system/status")
    return json({
      version: "1.32.2.4987",
      appName: "Prowlarr",
      startupPath: "/opt/Prowlarr",
      appData: "/config",
      isAdmin: true,
      instanceName: "Home Lab",
    });
  if (url.pathname === "/api/v1/health")
    return json([
      { type: "error", message: "Indexer failed at /data/indexers", wikiUrl: "https://wiki" },
      { type: "warning", message: "Download client" },
    ]);
  if (url.pathname === "/api/v1/indexer")
    return json([
      {
        name: "Secret Tracker",
        enable: true,
        indexerUrls: ["https://tracker.example"],
        fields: [{ name: "apiKey", value: KEY }],
      },
      { name: "Other", enable: false },
    ]);
  return json([
    { indexerId: 1, name: "Secret Tracker", mostRecentFailure: "2026-09-14T00:00:00Z" },
  ]);
}

describe("prowlarr client", () => {
  it("sends X-Api-Key auth and never puts the key in the URL", async () => {
    const expected = prowlarrAuthHeaders(KEY);
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
    const result = await testProwlarrConnection(context(request));
    expect(result).toEqual({ version: "1.32.2.4987", appName: "Prowlarr" });
  });

  it("maps 401 on system/status to unauthorized and never reflects the key", async () => {
    const request = vi.fn(async () => json({ message: `bad ${KEY}` }, 401));
    await expect(testProwlarrConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
    const overviewRequest = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v1/system/status")
        return json({ message: `bad ${KEY}` }, 401);
      return officialPayloads(options);
    });
    await expect(fetchProwlarrOverview(context(overviewRequest))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and unreachable", async () => {
    await expect(testProwlarrConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      ProwlarrError,
    );
    await expect(
      fetchProwlarrOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchProwlarrOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchProwlarrOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchProwlarrOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when indexerstatus is forbidden and never invents zeros", async () => {
    for (const status of [403, 404] as const) {
      const request = vi.fn(async (options: SecureHttpRequest) => {
        if (new URL(String(options.url)).pathname === "/api/v1/indexerstatus")
          return json({}, status);
        return officialPayloads(options);
      });
      const overview = await fetchProwlarrOverview(context(request));
      expect(overview.status).toBe("degraded");
      expect(overview.system.data?.version).toBe("1.32.2.4987");
      expect(overview.indexer.data).toEqual({ count: 2, enabledCount: 1 });
      expect(overview.health.data?.error).toBe(1);
      expect(overview.indexerStatus.status).toBe("unavailable");
      expect(overview.indexerStatus.data).toBeNull();
      expect(JSON.stringify(overview)).not.toContain("Secret Tracker");
      expect(JSON.stringify(overview)).not.toContain("tracker.example");
      expect(JSON.stringify(overview)).not.toContain(KEY);
      expect(JSON.stringify(overview)).not.toContain("/opt/Prowlarr");
    }
  });

  it("marks health unavailable without inventing counts", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v1/health") return json({}, 403);
      return officialPayloads(options);
    });
    const overview = await fetchProwlarrOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.health).toEqual({
      status: "unavailable",
      data: null,
      reason: "permission-denied",
    });
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testProwlarrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testProwlarrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ version: "1.32.2.4987" })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
