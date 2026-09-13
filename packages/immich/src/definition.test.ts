import { describe, expect, it, vi } from "vitest";
import { immichIntegrationDefinition } from "./definition";

describe("immich definition", () => {
  it("tests the connection with x-api-key and no query token", async () => {
    const request = vi.fn(
      async (options: { url: string | URL; headers?: Record<string, string> }) => {
        expect(options.headers?.["x-api-key"]).toBe("TOKEN-SECRET");
        expect(String(options.url)).not.toContain("apiKey");
        return {
          ok: true as const,
          status: 200,
          body: Buffer.from(JSON.stringify({ major: 1, minor: 142, patch: 0 })),
          latencyMs: 2,
        };
      },
    );
    const result = await immichIntegrationDefinition.testConnection({
      integrationId: "11111111-1111-4111-8111-111111111111",
      baseUrl: "https://immich.lab/",
      config: { verifyTls: true, timeoutMs: 8000 },
      secrets: { apiKey: "TOKEN-SECRET" },
      verifyTls: true,
      timeoutMs: 8000,
      request,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.metadata?.version).toBe("1.142.0");
  });
});
