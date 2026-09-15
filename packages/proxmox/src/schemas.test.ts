import { describe, expect, it } from "vitest";
import { proxmoxConfigSchema, proxmoxGuestActionInputSchema, proxmoxSecretSchema } from "./schemas";

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

  it("accepts bounded guest power input and rejects a zero VMID", () => {
    expect(
      proxmoxGuestActionInputSchema.parse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        node: "pve1",
        guestType: "lxc",
        vmid: 101,
      }),
    ).toMatchObject({ guestType: "lxc", vmid: 101 });
    expect(() =>
      proxmoxGuestActionInputSchema.parse({
        integrationId: "11111111-1111-4111-8111-111111111111",
        node: "pve1",
        guestType: "qemu",
        vmid: 0,
      }),
    ).toThrow();
  });
});
