import { describe, expect, it } from "vitest";
import { createIntegrationRegistry, createProductionIntegrationRegistry } from "./registry";
import { createTestHttpIntegrationDefinition } from "./test-support";

describe("IntegrationRegistry", () => {
  it("rejects duplicate ids, invalid versions and mutation after freeze", () => {
    const registry = createIntegrationRegistry();
    const definition = createTestHttpIntegrationDefinition();
    registry.register(definition);
    expect(() => registry.register(createTestHttpIntegrationDefinition())).toThrow(
      /Duplicate integration id/,
    );
    const capabilities = registry.get("test-http")?.capabilities as string[];
    expect(() => {
      (capabilities as string[]).push("docker.start");
    }).toThrow();
    registry.freeze();
    expect(() => registry.register(createTestHttpIntegrationDefinition())).toThrow(/frozen/);
  });

  it("exposes an empty frozen production registry", () => {
    const production = createProductionIntegrationRegistry();
    expect(production.list()).toEqual([]);
    expect(production.catalog()).toEqual([]);
    expect(() => production.register(createTestHttpIntegrationDefinition())).toThrow(/frozen/);
  });
});
