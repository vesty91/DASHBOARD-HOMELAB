import { IntegrationError } from "./errors";
import type { IntegrationCapability } from "./types";

export const CAPABILITY_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;

export function assertCapability(value: string): asserts value is IntegrationCapability {
  if (!CAPABILITY_PATTERN.test(value))
    throw new IntegrationError("MISCONFIGURED", "Invalid integration capability");
}

export function normalizeCapabilities(
  capabilities: readonly string[],
): readonly IntegrationCapability[] {
  const unique = new Set<string>();
  for (const capability of capabilities) {
    assertCapability(capability);
    if (unique.has(capability))
      throw new IntegrationError("MISCONFIGURED", "Duplicate integration capability");
    unique.add(capability);
  }
  return Object.freeze([...unique]);
}

export function hasCapability(
  capabilities: readonly string[],
  capability: IntegrationCapability,
): boolean {
  return capabilities.includes(capability);
}

export function requireCapability(
  capabilities: readonly string[],
  capability: IntegrationCapability,
): void {
  if (!hasCapability(capabilities, capability))
    throw new IntegrationError("FORBIDDEN", "Missing integration capability");
}
