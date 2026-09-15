import { describe, expect, it, vi } from "vitest";
import { IntegrationError } from "@dashboard/integrations";
import {
  customApiContextFromIntegration,
  fetchCustomApiOverview,
  fetchCustomApiValue,
  testCustomApiConnection,
} from "./client";
import { CustomApiError } from "./errors";
import { customApiConfigSchema } from "./schemas";
import { customApiAuthHeaders } from "./transport";
import type { SecureHttpRequest, SecureHttpResult } from "@dashboard/integrations";

const KEY = "notareal-custom-api-secret-0123456789";
const BEARER = "notareal-custom-bearer-0123456789";

function json(
  body: unknown,
  status = 200,
  extra: Partial<Extract<SecureHttpResult, { ok: true }>> = {},
): SecureHttpResult {
  return { ok: true, status, body: Buffer.from(JSON.stringify(body)), latencyMs: 3, ...extra };
}

function context(
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>,
  secrets: { apiKey?: string; bearerToken?: string } = { apiKey: KEY },
  header: "X-Api-Key" | undefined = "X-Api-Key",
) {
  return customApiContextFromIntegration({
    integrationId: "11111111-1111-4111-8111-111111111111",
    baseUrl: "https://api.lab:8443/",
    config: customApiConfigSchema.parse({
      verifyTls: true,
      timeoutMs: 8000,
      ...(header ? { apiKeyHeader: header } : {}),
      endpoints: [{ key: "status", label: "Status", path: "/status" }],
    }),
    secrets,
    verifyTls: true,
    timeoutMs: 8000,
    request,
  });
}

describe("custom-api client", () => {
  it("sends Authorization Bearer and api key headers without putting secrets in the URL", async () => {
    const expected = customApiAuthHeaders({
      bearerToken: BEARER,
      apiKey: KEY,
      apiKeyHeader: "X-Api-Key",
    });
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.Authorization).toBe(expected.Authorization);
      expect(options.headers?.["X-Api-Key"]).toBe(KEY);
      expect(options.maxRedirects).toBe(0);
      expect(options.maxRetries).toBe(0);
      const url = new URL(String(options.url));
      expect(url.toString()).not.toContain(KEY);
      expect(url.toString()).not.toContain(BEARER);
      expect(url.searchParams.has("apikey")).toBe(false);
      expect(options.method).toBe("GET");
      return json({ version: "1.0.0" });
    });
    await testCustomApiConnection(context(request, { apiKey: KEY, bearerToken: BEARER }));
    expect(request).toHaveBeenCalled();
  });

  it("omits the api key header when the header name is missing", async () => {
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.headers?.["X-Api-Key"]).toBeUndefined();
      expect(options.headers?.Authorization).toBeUndefined();
      return json({ ok: true });
    });
    await testCustomApiConnection(context(request, {}, undefined));
  });

  it("maps 401, 403, 404, 429 and 500", async () => {
    await expect(testCustomApiConnection(context(async () => json({}, 401)))).rejects.toMatchObject(
      {
        kind: "UNAUTHORIZED",
      },
    );
    await expect(
      testCustomApiConnection(context(async () => json({}, 403))),
    ).rejects.toBeInstanceOf(CustomApiError);
    await expect(testCustomApiConnection(context(async () => json({}, 404)))).rejects.toMatchObject(
      {
        kind: "NOT_FOUND",
      },
    );
    await expect(testCustomApiConnection(context(async () => json({}, 429)))).rejects.toMatchObject(
      {
        kind: "RATE_LIMITED",
      },
    );
    await expect(
      testCustomApiConnection(context(async () => json({}, 500))),
    ).rejects.toBeInstanceOf(IntegrationError);
  });

  it("maps timeout and rejects truncated or invalid JSON", async () => {
    await expect(
      fetchCustomApiOverview(
        context(async () => ({ ok: false as const, code: "TIMEOUT" as const, latencyMs: 8 })),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    await expect(
      testCustomApiConnection(
        context(async () => ({
          ok: true as const,
          status: 200,
          body: Buffer.from("{"),
          latencyMs: 1,
        })),
      ),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      testCustomApiConnection(
        context(async () => json({ version: "1" }, 200, { truncated: true })),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("extracts a bounded value and never returns raw payload keys", async () => {
    const result = await fetchCustomApiValue(
      context(async () => json({ secret: KEY, items: [{ value: 3 }] })),
      "status",
      "items[0].value",
      "number",
    );
    expect(result.value.data).toEqual({ display: "number", number: 3 });
    expect(JSON.stringify(result)).not.toContain(KEY);
  });
});
