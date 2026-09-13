import { describe, expect, it } from "vitest";
import { createProductionIntegrationRegistry } from "@dashboard/integrations";
import { createApplicationIntegrationRegistry } from "./integration-registry";

describe("application integration registry", () => {
  it("keeps the generic production registry empty", () => {
    expect(createProductionIntegrationRegistry().list()).toEqual([]);
  });

  it("registers Beszel, Docker, Immich, Jellyfin and Synology in the application composition", () => {
    const registry = createApplicationIntegrationRegistry();
    expect(registry.list().map((item) => item.id)).toEqual([
      "beszel",
      "docker",
      "immich",
      "jellyfin",
      "synology",
    ]);
    expect(registry.get("docker")?.secretFields).toEqual([]);
    expect(registry.get("synology")?.secretFields.map((field) => field.key)).toEqual([
      "password",
      "deviceId",
    ]);
    expect(
      registry.get("synology")?.secretFields.find((field) => field.key === "deviceId"),
    ).toMatchObject({ serverManaged: true });
    expect(registry.get("jellyfin")?.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(registry.get("immich")?.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(registry.get("beszel")?.secretFields.map((field) => field.key)).toEqual(["password"]);
    expect(() => registry.register(registry.get("docker")!)).toThrow(/frozen/);
  });
});
