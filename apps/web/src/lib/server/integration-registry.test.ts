import { describe, expect, it } from "vitest";
import { createProductionIntegrationRegistry } from "@dashboard/integrations";
import { createApplicationIntegrationRegistry } from "./integration-registry";

describe("application integration registry", () => {
  it("keeps the generic production registry empty", () => {
    expect(createProductionIntegrationRegistry().list()).toEqual([]);
  });

  it("registers exactly Docker in the application composition", () => {
    const registry = createApplicationIntegrationRegistry();
    expect(registry.list().map((item) => item.id)).toEqual(["docker"]);
    expect(registry.get("docker")?.secretFields).toEqual([]);
    expect(registry.has("synology")).toBe(false);
    expect(registry.has("jellyfin")).toBe(false);
    expect(registry.has("immich")).toBe(false);
    expect(() => registry.register(registry.get("docker")!)).toThrow(/frozen/);
  });
});
