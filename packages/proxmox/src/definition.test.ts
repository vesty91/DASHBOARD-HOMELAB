import { describe, expect, it } from "vitest";
import { proxmoxConfigSchema } from "./schemas";
import { PROXMOX_INTEGRATION_ID, proxmoxIntegrationDefinition } from "./definition";

describe("proxmox definition", () => {
  it("declares cluster read and guest power capabilities", () => {
    expect(proxmoxIntegrationDefinition.id).toBe(PROXMOX_INTEGRATION_ID);
    expect(proxmoxIntegrationDefinition.capabilities).toEqual([
      "cluster.read",
      "guests.start",
      "guests.shutdown",
      "guests.reboot",
    ]);
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
