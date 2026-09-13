import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  BESZEL_SYSTEMS_MAX_PAGES,
  BESZEL_SYSTEMS_PER_PAGE,
  beszelContextFromIntegration,
  fetchBeszelOverview,
  testBeszelConnection,
} from "./client";
import { BeszelError } from "./errors";
import { beszelConfigSchema } from "./schemas";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const PASSWORD = "BZ-API-SUPER-SECRET";
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";

function json(body: unknown, status = 200): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3 };
}

function context(request: (options: SecureHttpRequest) => Promise<SecureHttpResult>) {
  return beszelContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://beszel.lab/",
    config: beszelConfigSchema.parse({
      identity: "ops@lab.example",
      verifyTls: true,
      timeoutMs: 8000,
    }),
    secrets: { password: PASSWORD },
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

function page(items: unknown[], current = 1, totalPages = 1): SecureHttpResult {
  return json({ page: current, perPage: BESZEL_SYSTEMS_PER_PAGE, totalPages, items });
}

describe("beszel client", () => {
  it("authenticates then lists systems without leaking the token or password", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(PASSWORD);
      expect(url.toString()).not.toContain(TOKEN);
      if (options.method === "POST") {
        expect(options.body).toContain("ops@lab.example");
        expect(options.body).toContain(PASSWORD);
        expect(options.headers?.Authorization).toBeUndefined();
        return json({ token: TOKEN, record: { id: "u1", email: "ops@lab.example" } });
      }
      expect(options.headers?.Authorization).toBe(TOKEN);
      return page([
        {
          id: "sys1",
          name: "NAS",
          host: "10.0.0.8",
          status: "up",
          updated: "2026-09-13 10:00:00.000Z",
          info: { cpu: 10, mp: 20, dp: 30, bb: 128 },
        },
      ]);
    });
    const overview = await fetchBeszelOverview(context(request));
    expect(overview.status).toBe("available");
    expect(overview.hosts.data?.upCount).toBe(1);
    expect(JSON.stringify(overview)).not.toContain(PASSWORD);
    expect(JSON.stringify(overview)).not.toContain(TOKEN);
  });

  it("maps 401 without reflecting the password", async () => {
    const request = vi.fn(async () => json({ message: `bad ${PASSWORD}` }, 401));
    await expect(testBeszelConnection(context(request))).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
    });
  });

  it("preserves DNS errors", async () => {
    const request = vi.fn(async () => ({
      ok: false as const,
      code: "DNS_ERROR" as const,
      latencyMs: 2,
    }));
    await expect(fetchBeszelOverview(context(request))).rejects.toMatchObject({
      code: "DNS_ERROR",
    });
  });

  it("pages beyond 200 systems and stops at the official last page", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (options.method === "POST") return json({ token: TOKEN });
      const pageNumber = Number(new URL(String(options.url)).searchParams.get("page"));
      const items = Array.from(
        { length: pageNumber === 5 ? 10 : BESZEL_SYSTEMS_PER_PAGE },
        (_, i) => ({
          id: `p${pageNumber}-${i}`,
          name: `Host ${pageNumber}-${i}`,
          status: "up",
        }),
      );
      return page(items, pageNumber, 5);
    });
    const overview = await fetchBeszelOverview(context(request));
    expect(overview.hosts.data?.hostCount).toBe(4 * BESZEL_SYSTEMS_PER_PAGE + 10);
    expect(overview.hosts.data?.truncated).toBe(false);
  });

  it("marks the overview truncated when the safety bound is reached", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (options.method === "POST") return json({ token: TOKEN });
      const pageNumber = Number(new URL(String(options.url)).searchParams.get("page"));
      const items = Array.from({ length: BESZEL_SYSTEMS_PER_PAGE }, (_, i) => ({
        id: `p${pageNumber}-${i}`,
        name: `Host ${pageNumber}-${i}`,
        status: "up",
      }));
      return page(items, pageNumber, BESZEL_SYSTEMS_MAX_PAGES + 5);
    });
    const overview = await fetchBeszelOverview(context(request));
    expect(overview.hosts.data?.truncated).toBe(true);
    expect(overview.status).toBe("degraded");
    expect(overview.hosts.data?.hostCount).toBe(BESZEL_SYSTEMS_MAX_PAGES * BESZEL_SYSTEMS_PER_PAGE);
  });

  it("treats a down host as degraded without inventing metrics", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      if (options.method === "POST") return json({ token: TOKEN });
      return page([{ id: "sys1", name: "NAS", status: "down" }]);
    });
    const overview = await fetchBeszelOverview(context(request));
    expect(overview.status).toBe("degraded");
    expect(overview.hosts.data?.hosts[0]?.cpuPercent).toBeNull();
    expect(overview.hosts.data?.hosts[0]?.networkBytes).toBeNull();
  });

  it("rejects invalid JSON and control-character tokens", async () => {
    const invalid = vi.fn(async () => ({
      ok: true as const,
      status: 200,
      body: Buffer.from("{"),
      latencyMs: 1,
    }));
    await expect(testBeszelConnection(context(invalid))).rejects.toBeInstanceOf(IntegrationError);
    const injected = vi.fn(async () => json({ token: "abc\nInject" }));
    await expect(testBeszelConnection(context(injected))).rejects.toBeInstanceOf(Error);
  });

  it("maps timeout and 403", async () => {
    const timeout = vi.fn(async () => ({
      ok: false as const,
      code: "TIMEOUT" as const,
      latencyMs: 8,
    }));
    await expect(testBeszelConnection(context(timeout))).rejects.toBeInstanceOf(BeszelError);
    const forbidden = vi.fn(async () => json({}, 403));
    await expect(testBeszelConnection(context(forbidden))).rejects.toMatchObject({
      kind: "FORBIDDEN",
    });
  });
});
