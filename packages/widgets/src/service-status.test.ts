import { describe, expect, it } from "vitest";
import { assertWidgetContract } from "./definition";
import {
  SERVICE_STATUS_DEFAULT_MAX_ITEMS,
  serviceStatusConfigSchema,
  serviceStatusContract,
} from "./service-status";

describe("service-status widget", () => {
  it("is a non-public aggregator contract with a bounded default config", () => {
    expect(serviceStatusContract.publicSafe).toBe(false);
    expect(serviceStatusContract.id).toBe("service-status");
    assertWidgetContract(serviceStatusContract);
    expect(serviceStatusConfigSchema.parse(serviceStatusContract.defaultConfig)).toEqual({
      selectedSources: [],
      selectedIds: [],
      displayMode: "list",
      maxItems: SERVICE_STATUS_DEFAULT_MAX_ITEMS,
    });
  });

  it("rejects invalid ids, duplicates them in order and bounds maxItems", () => {
    expect(
      serviceStatusConfigSchema.parse({
        selectedIds: [
          "jellyfin:11111111-1111-4111-8111-111111111111",
          "jellyfin:11111111-1111-4111-8111-111111111111",
        ],
        selectedSources: ["jellyfin", "jellyfin"],
        maxItems: 3,
      }),
    ).toEqual({
      selectedSources: ["jellyfin"],
      selectedIds: ["jellyfin:11111111-1111-4111-8111-111111111111"],
      displayMode: "list",
      maxItems: 3,
    });
    expect(() => serviceStatusConfigSchema.parse({ selectedIds: ["synology"] })).toThrow();
    expect(() => serviceStatusConfigSchema.parse({ maxItems: 25 })).toThrow();
    expect(() => serviceStatusConfigSchema.parse({ selectedSources: ["generic"] })).toThrow();
  });
});
