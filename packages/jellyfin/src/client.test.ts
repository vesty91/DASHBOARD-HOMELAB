import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  fetchJellyfinOverview,
  jellyfinContextFromIntegration,
  testJellyfinConnection,
} from "./client";
import { jellyfinConfigSchema } from "./schemas";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const API_KEY = "JF-API-KEY-SECRET";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return jellyfinContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://jellyfin.lab/",
    config: jellyfinConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiKey: API_KEY },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

describe("jellyfin client", () => {
  it("sends X-Emby-Token and never puts the API key in the URL", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.["X-Emby-Token"]).toBe(API_KEY);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(API_KEY);
      expect(url.searchParams.has("api_key")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      if (url.pathname === "/System/Info") return json({ ServerName: "Home", Version: "10.10.7" });
      return json([]);
    });
    const result = await testJellyfinConnection(context(request));
    expect(result).toEqual({ serverName: "Home", version: "10.10.7" });
  });

  it("maps 401 to unauthorized and never reflects the API key", async () => {
    const request = vi.fn(async () => json({ message: `bad ${API_KEY}` }, 401));
    await expect(testJellyfinConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("returns a degraded overview when only sessions fail", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/System/Info")
        return json({ ServerName: "Home", Version: "10.10.7" });
      return { ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 };
    });
    const overview = await fetchJellyfinOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.server.status).toBe("available");
    expect(overview.sessions.status).toBe("unavailable");
    expect(overview.sessions.reason).toBe("timeout");
  });

  it("rejects invalid JSON", async () => {
    const request = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      body: Buffer.from("{"),
      latencyMs: 1,
    }));
    await expect(testJellyfinConnection(context(request))).rejects.toBeInstanceOf(IntegrationError);
  });
});
