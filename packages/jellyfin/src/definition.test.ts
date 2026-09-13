import { describe, expect, it, vi } from "vitest";
import { jellyfinConfigSchema } from "./schemas";
import { createJellyfinIntegrationDefinition } from "./definition";
import type { SecureHttpRequest } from "@dashboard/integrations";

describe("jellyfin definition", () => {
  it("exposes the Phase 10 capabilities and never puts the token in metadata", async () => {
    const definition = createJellyfinIntegrationDefinition();
    expect(definition.capabilities).toEqual(["server.read", "sessions.read", "streams.read"]);
    const request = vi.fn(async (options: SecureHttpRequest) => {
      expect(options.url.toString()).not.toContain("api_key");
      return {
        ok: true as const,
        status: 200,
        body: Buffer.from(JSON.stringify({ ServerName: "Home", Version: "10.10.7" })),
        latencyMs: 2,
      };
    });
    const result = await definition.testConnection({
      integrationId: "11111111-1111-4111-8111-111111111111",
      baseUrl: "https://jellyfin.lab/",
      config: jellyfinConfigSchema.parse({ verifyTls: true, timeoutMs: 8000 }),
      secrets: { apiKey: "TOKEN-SECRET" },
      verifyTls: true,
      timeoutMs: 8000,
      request,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.stringify(result.metadata)).not.toContain("TOKEN-SECRET");
  });
});
