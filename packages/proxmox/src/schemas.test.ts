import { describe, expect, it } from "vitest";
import { proxmoxConfigSchema, proxmoxSecretSchema } from "./schemas";

describe("proxmox schemas", () => {
  it("accepts a valid origin config and rejects malformed tokens", () => {
    expect(
      proxmoxConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }),
    ).toMatchObject({ verifyTls: true, timeoutMs: 8000 });
    expect(proxmoxSecretSchema.parse({ apiToken: "root@pam!dashboard=abcDEF0123456789" })).toEqual({
      apiToken: "root@pam!dashboard=abcDEF0123456789",
    });
    expect(() => proxmoxSecretSchema.parse({ apiToken: "bad\nkey" })).toThrow(/visible ASCII/);
    expect(() => proxmoxSecretSchema.parse({ apiToken: "plaintext" })).toThrow(/USER@REALM/);
    expect(() => proxmoxSecretSchema.parse({ apiToken: "" })).toThrow();
  });
});
