import { describe, expect, it } from "vitest";
import { TEST_TRUSTED_CA_PEM } from "@dashboard/integrations/test-tls-fixtures";
import { dockerIntegrationDefinition } from "./definition";

const INTEGRATION_ID = "11111111-1111-4111-8111-111111111111";

describe("Docker integration definition", () => {
  it("declares trustedCaPem as non-secret config and forwards it on testConnection", async () => {
    expect(dockerIntegrationDefinition.secretFields).toEqual([]);
    expect(
      dockerIntegrationDefinition.configFields.some((field) => field.key === "trustedCaPem"),
    ).toBe(true);
    const seen: Array<string | undefined> = [];
    const result = await dockerIntegrationDefinition.testConnection({
      integrationId: INTEGRATION_ID,
      baseUrl: "https://docker-proxy.test:2375/",
      verifyTls: true,
      timeoutMs: 8000,
      config: { verifyTls: true, timeoutMs: 8000, trustedCaPem: TEST_TRUSTED_CA_PEM },
      secrets: {},
      request: async (options) => {
        seen.push(options.trustedCaPem);
        const href = String(options.url);
        if (href.includes("/_ping"))
          return { ok: true, status: 200, body: Buffer.from("OK"), latencyMs: 2 };
        if (href.includes("/version"))
          return {
            ok: true,
            status: 200,
            body: Buffer.from(
              JSON.stringify({ Version: "28.3.0", ApiVersion: "1.55", MinAPIVersion: "1.40" }),
            ),
            latencyMs: 3,
          };
        throw new Error(href);
      },
    });
    expect(result.ok).toBe(true);
    expect(seen.every((value) => value === TEST_TRUSTED_CA_PEM)).toBe(true);
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
