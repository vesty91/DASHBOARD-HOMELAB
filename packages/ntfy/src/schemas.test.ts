import { describe, expect, it } from "vitest";
import { ntfyConfigSchema, ntfyPublishInputSchema, ntfySecretSchema } from "./schemas";

describe("ntfy schemas", () => {
  it("accepts a valid origin config and an optional visible-ASCII token", () => {
    expect(
      ntfyConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(ntfySecretSchema.parse({})).toEqual({});
    expect(ntfySecretSchema.parse({ accessToken: "tk_abcdefghijklmnop0123456789" })).toEqual({
      accessToken: "tk_abcdefghijklmnop0123456789",
    });
    expect(() => ntfySecretSchema.parse({ accessToken: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => ntfySecretSchema.parse({ accessToken: "" })).toThrow();
  });

  it("accepts a bounded publish payload and rejects oversized or reserved topics", () => {
    expect(
      ntfyPublishInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        topic: "homelab-alerts",
        message: "Disk warning",
      }),
    ).toMatchObject({
      topic: "homelab-alerts",
      message: "Disk warning",
      priority: "default",
    });
    expect(() =>
      ntfyPublishInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        topic: "v1",
        message: "nope",
      }),
    ).toThrow();
    expect(() =>
      ntfyPublishInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        topic: "homelab-alerts",
        message: "x".repeat(4097),
      }),
    ).toThrow();
    expect(() =>
      ntfyPublishInputSchema.parse({
        integrationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        topic: "homelab-alerts",
        message: "ok",
        tags: ["a", "b", "c", "d", "e", "f"],
      }),
    ).toThrow();
  });
});
