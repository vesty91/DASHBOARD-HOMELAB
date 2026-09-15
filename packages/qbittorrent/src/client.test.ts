import { describe, expect, it, vi } from "vitest";
import {
  IntegrationError,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import {
  fetchQbittorrentOverview,
  qbittorrentContextFromIntegration,
  testQbittorrentConnection,
} from "./client";
import { qbittorrentConfigSchema } from "./schemas";
import { QBITTORRENT_TORRENTS_MAX } from "./dto";

const USERNAME = "admin";
const PASSWORD = "correct-horse-battery-staple";
const SID = "QB-SID-SUPER-SECRET-001";

function text(body: string, status = 200, setCookie?: readonly string[]): SecureHttpResult {
  return {
    ok: true,
    status,
    body: Buffer.from(body),
    latencyMs: 3,
    ...(setCookie === undefined ? {} : { setCookie }),
  };
}

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return qbittorrentContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://qbittorrent.lab:8080/",
    config: qbittorrentConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { username: USERNAME, password: PASSWORD },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const url = new URL(String(options.url));
  if (url.pathname === "/api/v2/auth/login")
    return text("Ok.", 200, [`SID=${SID}; Path=/; HttpOnly`]);
  if (url.pathname === "/api/v2/auth/logout") return text("Ok.");
  if (url.pathname === "/api/v2/app/version") return text("v4.6.5");
  if (url.pathname === "/api/v2/transfer/info")
    return json({
      dl_info_speed: 2048,
      up_info_speed: 512,
      connection_status: "connected",
      dl_info_data: 99_999,
    });
  return json([
    {
      name: "Secret.Movie",
      hash: "abc123",
      magnet_uri: "magnet:?xt=urn:btih:abc123",
      save_path: "/downloads/secret",
      state: "downloading",
    },
    { name: "Seed", state: "uploading" },
    { name: "Wait", state: "queuedDL" },
  ]);
}

describe("qbittorrent client", () => {
  it("logs in with a form body, sends the SID cookie, and never puts secrets in the URL", async () => {
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const url = new URL(String(options.url));
      expect(url.search).toBe("");
      expect(url.toString()).not.toContain(PASSWORD);
      expect(url.toString()).not.toContain(SID);
      expect(url.searchParams.has("username")).toBe(false);
      expect(url.searchParams.has("password")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      if (url.pathname === "/api/v2/auth/login") {
        expect(options.method).toBe("POST");
        expect(options.headers?.["Content-Type"]).toBe("application/x-www-form-urlencoded");
        expect(options.body).toBe(
          new URLSearchParams({ username: USERNAME, password: PASSWORD }).toString(),
        );
        expect(options.body).not.toContain("?");
      } else {
        expect(options.headers?.Cookie).toBe(`SID=${SID}`);
      }
      return officialPayloads(options);
    });
    const result = await testQbittorrentConnection(context(request));
    expect(result).toEqual({ version: "v4.6.5" });
    expect(JSON.stringify(result)).not.toContain(SID);
    expect(JSON.stringify(result)).not.toContain(PASSWORD);
    expect(logs.join("\n")).not.toContain(SID);
    logSpy.mockRestore();
    const paths = request.mock.calls.map(([options]) => new URL(String(options.url)).pathname);
    expect(paths).toContain("/api/v2/auth/login");
    expect(paths).toContain("/api/v2/auth/logout");
  });

  it("maps 401/403 on login to unauthorized and never reflects the cookie or password", async () => {
    await expect(
      testQbittorrentConnection(context(async () => text(`Fails. ${PASSWORD} ${SID}`, 401))),
    ).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    await expect(
      fetchQbittorrentOverview(context(async () => text("Fails.", 403))),
    ).rejects.toMatchObject({ kind: "UNAUTHORIZED" });
    const failedLogin = vi.fn(async () => text("Fails."));
    await expect(fetchQbittorrentOverview(context(failedLogin))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("maps timeout, DNS, TLS and unreachable after login failure or later requests", async () => {
    await expect(
      fetchQbittorrentOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ kind: "TIMEOUT" });
    await expect(
      fetchQbittorrentOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchQbittorrentOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchQbittorrentOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
    await expect(
      testQbittorrentConnection(context(async () => text("Ok."))),
    ).rejects.toBeInstanceOf(IntegrationError);
  });

  it("returns a sanitized overview without torrent names or the SID", async () => {
    const overview = await fetchQbittorrentOverview(
      context(async (options) => officialPayloads(options)),
    );
    expect(overview.status).toBe("available");
    expect(overview.version.data?.version).toBe("v4.6.5");
    expect(overview.transfer.data).toEqual({
      downloadSpeedBps: 2048,
      uploadSpeedBps: 512,
      connectionStatus: "connected",
    });
    expect(overview.torrents.data).toEqual({
      downloading: 1,
      uploading: 1,
      stalled: 0,
      queued: 1,
      paused: 0,
      other: 0,
    });
    const serialized = JSON.stringify(overview);
    expect(serialized).not.toContain(SID);
    expect(serialized).not.toContain(PASSWORD);
    expect(serialized).not.toContain("Secret.Movie");
    expect(serialized).not.toContain("magnet");
    expect(serialized).not.toContain("/downloads");
    expect(serialized).not.toContain("99999");
  });

  it("rejects invalid JSON and oversized torrent lists", async () => {
    const invalidJson = vi.fn(async (options: SecureHttpRequest) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/v2/auth/login") return officialPayloads(options);
      if (pathname === "/api/v2/transfer/info")
        return { ok: true as const, status: 200, body: Buffer.from("{"), latencyMs: 1 };
      return officialPayloads(options);
    });
    const overview = await fetchQbittorrentOverview(context(invalidJson));
    expect(overview.status).toBe("degraded");
    expect(overview.transfer.status).toBe("unavailable");
    const oversized = vi.fn(async (options: SecureHttpRequest) => {
      const pathname = new URL(String(options.url)).pathname;
      if (pathname === "/api/v2/torrents/info")
        return json(
          Array.from({ length: QBITTORRENT_TORRENTS_MAX + 1 }, () => ({
            name: "Secret.Movie",
            state: "downloading",
          })),
        );
      return officialPayloads(options);
    });
    const oversizedOverview = await fetchQbittorrentOverview(context(oversized));
    expect(oversizedOverview.torrents.status).toBe("unavailable");
    expect(JSON.stringify(oversizedOverview)).not.toContain("Secret.Movie");
  });

  it("maps a later timeout without inventing speeds", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api/v2/transfer/info")
        return { ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 };
      return officialPayloads(options);
    });
    const overview = await fetchQbittorrentOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.transfer).toEqual({
      status: "unavailable",
      data: null,
      reason: "timeout",
    });
    expect(overview.version.data?.version).toBe("v4.6.5");
  });
});
