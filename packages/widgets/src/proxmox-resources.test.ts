import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  PROXMOX_RESOURCES_UNSET_INTEGRATION_ID,
  proxmoxResourcesConfigSchema,
  proxmoxResourcesContract,
} from "./proxmox-resources";

describe("proxmox-resources widget", () => {
  it("is a non-public contract with a valid default config", () => {
    expect(proxmoxResourcesContract.publicSafe).toBe(false);
    expect(proxmoxResourcesContract.id).toBe("proxmox-resources");
    assertWidgetContract(proxmoxResourcesContract);
    expect(proxmoxResourcesConfigSchema.parse(proxmoxResourcesContract.defaultConfig)).toEqual({
      integrationId: PROXMOX_RESOURCES_UNSET_INTEGRATION_ID,
    });
  });
});
