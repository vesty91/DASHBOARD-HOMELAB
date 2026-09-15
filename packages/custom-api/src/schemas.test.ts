import { describe, expect, it } from "vitest";
import { customApiConfigSchema, customApiSecretSchema } from "./schemas";

describe("custom-api schemas", () => {
  it("accepts an allowlisted endpoint set and optional secrets", () => {
    expect(
      customApiConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
        apiKeyHeader: "X-Api-Key",
        endpoints: [{ key: "status", label: "Status", path: "/status" }],
      }),
    ).toMatchObject({
      apiKeyHeader: "X-Api-Key",
      endpoints: [{ key: "status", path: "/status" }],
    });
    expect(customApiSecretSchema.parse({})).toEqual({});
    expect(customApiSecretSchema.parse({ bearerToken: "tok" })).toEqual({ bearerToken: "tok" });
    expect(() => customApiSecretSchema.parse({ apiKey: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() =>
      customApiConfigSchema.parse({
        endpoints: [{ key: "Status", label: "Status", path: "/status" }],
      }),
    ).toThrow();
    expect(() =>
      customApiConfigSchema.parse({
        apiKeyHeader: "Authorization",
        endpoints: [{ key: "status", label: "Status", path: "/status" }],
      }),
    ).toThrow(/not allowed/i);
    expect(() =>
      customApiConfigSchema.parse({
        endpoints: [
          { key: "a", label: "A", path: "/a" },
          { key: "a", label: "B", path: "/b" },
        ],
      }),
    ).toThrow(/unique/i);
    expect(() =>
      customApiConfigSchema.parse({
        endpoints: [{ key: "status", label: "Status", path: "/status?x=1" }],
      }),
    ).toThrow();
  });
});
