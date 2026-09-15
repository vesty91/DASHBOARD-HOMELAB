import { isSensitiveKey } from "@dashboard/secrets";
import { AutomationError } from "./errors";
import { AUTOMATION_CONFIG_MAX_BYTES } from "./types";

const MAX_WALK_DEPTH = 8;
const MAX_WALK_KEYS = 64;

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function walkForbiddenKeys(value: unknown, depth: number): void {
  if (depth > MAX_WALK_DEPTH)
    throw new AutomationError("VALIDATION_ERROR", "Automation config is too deep");
  if (Array.isArray(value)) {
    if (value.length > 32)
      throw new AutomationError("VALIDATION_ERROR", "Automation config array is too large");
    for (const entry of value) walkForbiddenKeys(entry, depth + 1);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > MAX_WALK_KEYS)
    throw new AutomationError("VALIDATION_ERROR", "Automation config has too many keys");
  for (const [key, entry] of entries) {
    if (isSensitiveKey(key))
      throw new AutomationError("VALIDATION_ERROR", "Automation config must not contain secrets");
    walkForbiddenKeys(entry, depth + 1);
  }
}

export function assertSafeAutomationJson(
  value: unknown,
  label: string,
  maxBytes = AUTOMATION_CONFIG_MAX_BYTES,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new AutomationError("VALIDATION_ERROR", `${label} must be a JSON object`);
  const record = value as Record<string, unknown>;
  if (jsonBytes(record) > maxBytes)
    throw new AutomationError("VALIDATION_ERROR", `${label} exceeds the size limit`);
  walkForbiddenKeys(record, 0);
  return record;
}

export function assertSafeOptionalAutomationJson(
  value: unknown,
  label: string,
): Record<string, unknown> | null {
  if (value == null) return null;
  return assertSafeAutomationJson(value, label);
}
