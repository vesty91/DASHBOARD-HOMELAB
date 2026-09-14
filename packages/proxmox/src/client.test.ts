import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  fetchProxmoxOverview,
  proxmoxContextFromIntegration,
  testProxmoxConnection,
} from "./client";
import { ProxmoxError } from "./errors";
import { proxmoxConfigSchema } from "./schemas";
import { proxmoxAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const API_TOKEN = "root@pam!dashboard=abcDEF0123456789";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return proxmoxContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://pve.lab:8006/",
    config: proxmoxConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
    secrets: { apiToken: API_TOKEN },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function officialPayloads(options: SecureHttpRequest): SecureHttpResult {
  const pathname = new URL(String(options.url)).pathname;
  if (pathname === "/api2/json/version")
    return json({ data: { version: "8.2.4", release: "8.2", repoid: "deadbeef" } });
  if (pathname === "/api2/json/cluster/status")
    return json({
      data: [
        { type: "cluster", name: "homelab", quorate: 1 },
        { type: "node", name: "pve1", online: 1, ip: "10.0.0.8" },
      ],
    });
  return json({
    data: [
      {
        type: "node",
        node: "pve1",
        status: "online",
        cpu: 0.2,
        mem: 4_000,
        maxmem: 16_000,
        uptime: 99,
      },
      { type: "qemu", vmid: 100, name: "secret-vm", status: "running" },
      { type: "lxc", vmid: 101, name: "secret-ct", status: "stopped" },
    ],
  });
}

describe("proxmox client", () => {
  it("sends PVEAPIToken and never puts the token in the URL", async () => {
    const expected = proxmoxAuthHeaders(API_TOKEN);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(API_TOKEN);
      expect(url.searchParams.has("token")).toBe(false);
      expect(options.maxRedirects).toBe(0);
      return officialPayloads(options);
    });
    const result = await testProxmoxConnection(context(request));
    expect(result).toEqual({ version: "8.2.4", release: "8.2" });
  });

  it("maps 401 to unauthorized and never reflects the token", async () => {
    const request = vi.fn(async () => json({ message: `bad ${API_TOKEN}` }, 401));
    await expect(testProxmoxConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("maps 403, timeout, DNS, TLS and unreachable", async () => {
    await expect(testProxmoxConnection(context(async () => json({}, 403)))).rejects.toBeInstanceOf(
      ProxmoxError,
    );
    await expect(
      fetchProxmoxOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      fetchProxmoxOverview(
        context(async () => ({ ok: false as const, code: "DNS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "DNS_ERROR" });
    await expect(
      fetchProxmoxOverview(
        context(async () => ({ ok: false as const, code: "TLS_ERROR" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "TLS_ERROR" });
    await expect(
      fetchProxmoxOverview(
        context(async () => ({ ok: false as const, code: "UNREACHABLE" as const, latencyMs: 2 })),
      ),
    ).rejects.toMatchObject({ code: "UNREACHABLE" });
  });

  it("returns a degraded overview when only cluster status fails", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (new URL(String(options.url)).pathname === "/api2/json/cluster/status")
        return { ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 };
      return officialPayloads(options);
    });
    const overview = await fetchProxmoxOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.version.status).toBe("available");
    expect(overview.cluster.status).toBe("unavailable");
    expect(overview.cluster.reason).toBe("timeout");
    expect(JSON.stringify(overview)).not.toContain("secret-vm");
    expect(JSON.stringify(overview)).not.toContain(API_TOKEN);
  });

  it("rejects invalid JSON and oversized truncated bodies", async () => {
    await expect(
      testProxmoxConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testProxmoxConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ data: { version: "8" } })),
          truncated: true,
          latencyMs: 1,
        })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});
