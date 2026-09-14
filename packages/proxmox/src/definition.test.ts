import { describe, expect, it } from "vitest";
import { proxmoxConfigSchema } from "./schemas";
import { PROXMOX_INTEGRATION_ID, proxmoxIntegrationDefinition } from "./definition";

describe("proxmox definition", () => {
  it("is a read-only cluster adapter", () => {
    expect(proxmoxIntegrationDefinition.id).toBe(PROXMOX_INTEGRATION_ID);
    expect(proxmoxIntegrationDefinition.capabilities).toEqual(["cluster.read"]);
    expect(proxmoxIntegrationDefinition.secretFields.map((field) => field.key)).toEqual([
      "apiToken",
    ]);
    expect(
      proxmoxConfigSchema.parse({
        verifyTls: true,
        timeoutMs: 8000,
      }).verifyTls,
    ).toBe(true);
  });
});
