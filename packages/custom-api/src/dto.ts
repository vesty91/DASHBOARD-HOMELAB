import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import { extractJsonPath } from "./json-path";
import type {
  CustomApiBadgeTone,
  CustomApiDisplayMode,
  CustomApiSection,
  CustomApiValueDto,
} from "./types";

export const CUSTOM_API_TEXT_MAX = 120;
export const CUSTOM_API_BADGE_MAX = 32;
export const CUSTOM_API_LIST_ITEM_MAX = 60;
export const CUSTOM_API_LIST_MAX_ITEMS = 5;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Custom API returned invalid JSON");
  }
}

function stripControl(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/gu, "");
}

function coerceScalar(value: unknown): string | undefined {
  if (typeof value === "string") return stripControl(value).trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return undefined;
}

function redactText(value: string, secretValues: readonly string[]): string {
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? stripControl(redacted) : "[REDACTED]";
}

function bound(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

const SUCCESS_WORDS = new Set(["true", "ok", "up", "healthy", "online", "running", "success"]);
const DANGER_WORDS = new Set(["false", "error", "down", "critical", "offline", "failed", "danger"]);
const WARNING_WORDS = new Set(["degraded", "warning", "pending", "warn"]);

function badgeTone(raw: string): CustomApiBadgeTone {
  const normalized = raw.toLocaleLowerCase("und");
  if (SUCCESS_WORDS.has(normalized)) return "success";
  if (DANGER_WORDS.has(normalized)) return "danger";
  if (WARNING_WORDS.has(normalized)) return "warning";
  return "neutral";
}

function unavailable(
  reason: CustomApiSection<CustomApiValueDto>["reason"] = "invalid-response",
): CustomApiSection<CustomApiValueDto> {
  return { status: "unavailable", data: null, reason };
}

export function mapCustomApiValue(
  payload: unknown,
  path: string,
  display: CustomApiDisplayMode,
  secretValues: readonly string[] = [],
): CustomApiSection<CustomApiValueDto> {
  const extracted = extractJsonPath(payload, path);
  if (extracted === undefined) return unavailable("invalid-response");
  switch (display) {
    case "text": {
      const scalar = coerceScalar(extracted);
      if (scalar === undefined || scalar.length === 0) return unavailable();
      const text = bound(redactText(scalar, secretValues), CUSTOM_API_TEXT_MAX);
      return { status: "available", data: { display: "text", text } };
    }
    case "number": {
      if (typeof extracted !== "number" || !Number.isFinite(extracted)) return unavailable();
      const redacted = redactKnownSecretValues(extracted, secretValues);
      if (typeof redacted !== "number") {
        return {
          status: "available",
          data: { display: "text", text: bound(String(redacted), CUSTOM_API_TEXT_MAX) },
        };
      }
      return { status: "available", data: { display: "number", number: redacted } };
    }
    case "badge": {
      const scalar = coerceScalar(extracted);
      if (scalar === undefined || scalar.length === 0) return unavailable();
      const label = bound(redactText(scalar, secretValues), CUSTOM_API_BADGE_MAX);
      return {
        status: "available",
        data: { display: "badge", label, tone: badgeTone(scalar) },
      };
    }
    case "list": {
      if (!Array.isArray(extracted)) return unavailable();
      const items: string[] = [];
      for (const entry of extracted.slice(0, CUSTOM_API_LIST_MAX_ITEMS)) {
        const scalar = coerceScalar(entry);
        if (scalar === undefined || scalar.length === 0) continue;
        items.push(bound(redactText(scalar, secretValues), CUSTOM_API_LIST_ITEM_MAX));
      }
      if (items.length === 0) return unavailable();
      return {
        status: "available",
        data: {
          display: "list",
          items: Object.freeze(items),
          truncated: extracted.length > CUSTOM_API_LIST_MAX_ITEMS,
        },
      };
    }
    default: {
      const _exhaustive: never = display;
      invalid(String(_exhaustive));
    }
  }
}
