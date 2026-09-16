import { NotificationError } from "./errors";
import { NOTIFICATION_BODY_MAX, NOTIFICATION_TITLE_MAX } from "./types";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const HTML_TAG = /<\/?[a-z][\s\S]*?>/iu;
const SECRETISH =
  /\b(bearer\s+[a-z0-9._~+/=-]{8,}|api[_-]?key\s*[:=]\s*\S+|sk-[a-z0-9]{16,}|eyJ[a-z0-9_-]{20,}\.[a-z0-9_-]+\.[a-z0-9_-]+)\b/iu;

export function sanitizeNotificationText(value: string, field: "title" | "body"): string {
  const max = field === "title" ? NOTIFICATION_TITLE_MAX : NOTIFICATION_BODY_MAX;
  const trimmed = value.replace(/\r\n/gu, "\n").trim();
  if (!trimmed) throw new NotificationError("VALIDATION_ERROR", `${field} is required`);
  if (trimmed.length > max)
    throw new NotificationError("VALIDATION_ERROR", `${field} exceeds max length`);
  if (CONTROL_CHARS.test(trimmed))
    throw new NotificationError("VALIDATION_ERROR", `${field} contains control characters`);
  if (HTML_TAG.test(trimmed))
    throw new NotificationError("VALIDATION_ERROR", `${field} must be plain text`);
  if (SECRETISH.test(trimmed))
    throw new NotificationError("VALIDATION_ERROR", `${field} contains sensitive material`);
  return trimmed;
}
