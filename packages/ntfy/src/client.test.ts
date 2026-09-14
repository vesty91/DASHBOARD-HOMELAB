import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import { fetchNtfyOverview, ntfyContextFromIntegration, testNtfyConnection } from "./client";
import { NtfyError } from "./errors";
import { ntfyConfigSchema } from "./schemas";
import { ntfyAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const TOKEN = "tk_abcdefghijklmnop0123456789ABCDEF";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  secrets: { accessToken?: string } = { accessToken: TOKEN },
) {
  return ntfyContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://ntfy.lab/",
    config: ntfyConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets,
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/v1/health") return json({ healthy: true });
  if (url.pathname === "/v1/stats") return json({ messages: 12, messages_rate: 0.5 });
  return json({ version: "2.11.0", commit: "deadbeef", date: "2026-01-01" });
}

describe("ntfy client", () => {
  it("sends Bearer auth when a token is present and never puts it in the URL", async () => {
    const expected = ntfyAuthHeaders(TOKEN);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(TOKEN);
      expect(url.searchParams.has("token")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      return officialPayloads(options);
    });
    const result = await testNtfyConnection(context(request));
    expect(result).toEqual({ healthy: true });
  });

  it("omits Authorization when no access token is configured", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBeUndefined();
      expect(options.headers?.Accept).toBe("application/json");
      return officialPayloads(options);
    });
    await expect(testNtfyConnection(context(request, {}))).resolves.toEqual({ healthy: true });
  });

  it("maps 401 on health to unauthorized and never reflects the token", async () => {
    const request = vi.fn(async () => json({ message: `bad ${TOKEN}` }, 401));
    await expect(testNtfyConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
    const overviewRequest = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/v1/health")
        return json({ message: `bad ${TOKEN}` }, 401);
      return officialPayloads(options);
    });
    await expect(fetchNtfyOverview(context(overviewRequest))).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and unreachable", async () => {
    await expect(testNtfyConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      NtfyError,
    );
    await expect(
      fetchNtfyOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchNtfyOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchNtfyOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchNtfyOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when version is admin-only and never invents a version", async () => {
    for (const status of [401, 403, 404] as const) {
      const request = vi.fn(async (options: SecureHttpRequest) => {
        if (new URL(String(options.url)).pathname === "/v1/version") return json({}, status);
        return officialPayloads(options);
      });
      const overview = await fetchNtfyOverview(context(request));
      expect(overview.status).toBe("degraded");
      expect(overview.health.status).toBe("available");
      expect(overview.health.data?.healthy).toBe(true);
      expect(overview.stats.data?.messages).toBe(12);
      expect(overview.version.status).toBe("unavailable");
      expect(overview.version.data).toBeNull();
      expect(JSON.stringify(overview)).not.toContain(TOKEN);
    }
  });

  it("marks the overview degraded when health is false without inventing stats", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/v1/health") return json({ healthy: false });
      return officialPayloads(options);
    });
    const overview = await fetchNtfyOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.health.data?.healthy).toBe(false);
    expect(overview.stats.status).toBe("available");
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testNtfyConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testNtfyConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ healthy: true })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
