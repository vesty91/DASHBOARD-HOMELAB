import { describe, expect, it } from "vitest";
import { createProductionIntegrationRegistry } from "@dashboard/integrations";
import { createApplicationIntegrationRegistry } from "./integration-registry";

describe("application integration registry", () => {
  it("keeps the generic production registry empty", () => {
    expect(createProductionIntegrationRegistry().list()).toEqual([]);
  });

  it("registers Beszel, Docker, Immich, Jellyfin, Prometheus, Proxmox, Synology and Uptime Kuma in the application composition", () => {
    const registry = createApplicationIntegrationRegistry();
    expect(registry.list().map((item) => item.id)).toEqual([
      "beszel",
      "docker",
      "immich",
      "jellyfin",
      "prometheus",
      "proxmox",
      "synology",
      "uptime-kuma",
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
    expect(registry.get("prometheus")?.secretFields.map((field) => field.key)).toEqual([
      "bearerToken",
    ]);
    expect(registry.get("uptime-kuma")?.secretFields.map((field) => field.key)).toEqual(["apiKey"]);
    expect(registry.get("proxmox")?.secretFields.map((field) => field.key)).toEqual(["apiToken"]);
    expect(() => registry.register(registry.get("docker")!)).toThrow(/frozen/);
  });
});
