import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { fetchRadarrOverview, radarrContextFromIntegration, testRadarrConnection } from "./client";
import { RadarrError } from "./errors";
import { radarrConfigSchema } from "./schemas";
import { radarrAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const KEY = "notareal-radarr-apikey-0123456789";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return radarrContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://radarr.lab:7878/",
    config: radarrConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiKey: KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/api/v3/system/status")
    return json({
      version: "4.0.14.2939",
      appName: "Radarr",
      startupPath: "/opt/Radarr",
      instanceName: "Home Lab",
    });
  if (url.pathname === "/api/v3/health")
    return json([
      { type: "error", message: "Indexer failed at /data/movies", wikiUrl: "https://wiki" },
      { type: "warning", message: "Download client" },
    ]);
  if (url.pathname === "/api/v3/queue/status")
    return json({ totalCount: 4, count: 2, unknownCount: 1, errors: false, warnings: true });
  if (url.pathname === "/api/v3/movie")
    return json([{ title: "Secret Movie", path: "/data/movies/Secret Movie" }]);
  return json([{ path: "/data", label: "tv", freeSpace: 100, totalSpace: 400 }]);
}

describe("radarr client", () => {
  it("sends X-Api-Key auth and never puts the key in the URL", async () => {
    const expected = radarrAuthHeaders(KEY);
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
    const result = await testRadarrConnection(context(request));
    expect(result).toEqual({ version: "4.0.14.2939", appName: "Radarr" });
  });

  it("maps 401 on system/status to unauthorized and never reflects the key", async () => {
    const request = vi.fn(async () => json({ message: `bad ${KEY}` }, 401));
    await expect(testRadarrConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
    const overviewRequest = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v3/system/status")
        return json({ message: `bad ${KEY}` }, 401);
      return officialPayloads(options);
    });
    await expect(fetchRadarrOverview(context(overviewRequest))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and unreachable", async () => {
    await expect(testRadarrConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      RadarrError,
    );
    await expect(
      fetchRadarrOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchRadarrOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchRadarrOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchRadarrOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when diskspace is forbidden and never invents zeros", async () => {
    for (const status of [403, 404] as const) {
      const request = vi.fn(async (options: SecureHttpRequest) => {
        if (new URL(String(options.url)).pathname === "/api/v3/diskspace") return json({}, status);
        return officialPayloads(options);
      });
      const overview = await fetchRadarrOverview(context(request));
      expect(overview.status).toBe("degraded");
      expect(overview.system.data?.version).toBe("4.0.14.2939");
      expect(overview.movie.data?.count).toBe(1);
      expect(overview.queue.data?.totalCount).toBe(4);
      expect(overview.health.data?.error).toBe(1);
      expect(overview.diskSpace.status).toBe("unavailable");
      expect(overview.diskSpace.data).toBeNull();
      expect(JSON.stringify(overview)).not.toContain("Secret Movie");
      expect(JSON.stringify(overview)).not.toContain("/data/movies");
      expect(JSON.stringify(overview)).not.toContain(KEY);
    }
  });

  it("marks health unavailable without inventing counts", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v3/health") return json({}, 403);
      return officialPayloads(options);
    });
    const overview = await fetchRadarrOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.health).toEqual({
      status: "unavailable",
      data: null,
      reason: "permission-denied",
    });
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testRadarrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testRadarrConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ version: "4.0.14.2939" })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
