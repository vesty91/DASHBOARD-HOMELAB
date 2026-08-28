import { z } from "zod";
import { mapHttpResult, parseJsonBody } from "./http-client";
import type { IntegrationDefinition, JsonObject } from "./types";

export const TEST_HTTP_INTEGRATION_ID = "test-http";

const configSchema = z.object({
  verifyTls: z.boolean().default(true),
  timeoutMs: z.number().int().min(500).max(30_000).default(5_000),
  path: z.string().trim().min(1).max(512).default("/health"),
});

const secretSchema = z.object({
  apiKey: z.string().min(1).max(4096),
});

export function createTestHttpIntegrationDefinition(): IntegrationDefinition<
  z.infer<typeof configSchema>,
  z.infer<typeof secretSchema>
> {
  const definition: IntegrationDefinition<
    z.infer<typeof configSchema>,
    z.infer<typeof secretSchema>
  > = {
    id: TEST_HTTP_INTEGRATION_ID,
    displayName: "Test HTTP",
    version: 1,
    description: "TEST-ONLY HTTP integration. Do not register in production.",
    configSchema,
    secretSchema,
    capabilities: ["test.ping"],
    allowedSchemes: ["http:", "https:"],
    configFields: [
      { key: "verifyTls", label: "Vérifier TLS", required: false },
      { key: "timeoutMs", label: "Timeout (ms)", required: false },
      { key: "path", label: "Chemin", required: false },
    ],
    secretFields: [
      {
        key: "apiKey",
        label: "API key",
        required: true,
        valueSchema: z.string().min(1).max(4096),
      },
    ],
    createClient(ctx) {
      return { testConnection: () => definition.testConnection(ctx) };
    },
    async testConnection(ctx) {
      const target = new URL(ctx.config.path, ctx.baseUrl);
      const result = mapHttpResult(
        await ctx.request({
          url: target,
          method: "GET",
          headers: { authorization: `Bearer ${ctx.secrets.apiKey}` },
          verifyTls: ctx.verifyTls,
          timeoutMs: ctx.timeoutMs,
        }),
      );
      if (!result.ok) return { ok: false, code: result.code, message: "Connection failed" };
      try {
        const payload = parseJsonBody(result.body);
        if (!payload || typeof payload !== "object" || (payload as JsonObject).ok !== true)
          return { ok: false, code: "INVALID_RESPONSE", message: "Unexpected payload" };
        const metadata = sanitizeTestMetadata(payload);
        return {
          ok: true,
          latencyMs: result.latencyMs,
          ...(metadata ? { metadata } : {}),
        };
      } catch {
        return { ok: false, code: "INVALID_RESPONSE", message: "Invalid JSON" };
      }
    },
  };
  return definition;
}

function sanitizeTestMetadata(payload: unknown): JsonObject | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const version = (payload as JsonObject).version;
  if (typeof version !== "string") return undefined;
  return { version: version.slice(0, 64) };
}
