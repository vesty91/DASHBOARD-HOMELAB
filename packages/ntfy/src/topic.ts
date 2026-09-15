import { IntegrationError, joinAllowlistedPath } from "@dashboard/integrations";

export const NTFY_TOPIC_MAX = 64;
export const NTFY_TITLE_MAX = 120;
export const NTFY_MESSAGE_MAX = 4096;
export const NTFY_TAG_MAX = 5;
export const NTFY_TAG_LENGTH_MAX = 32;

export const NTFY_PRIORITIES = ["min", "low", "default", "high", "max"] as const;
export type NtfyPriority = (typeof NTFY_PRIORITIES)[number];

const TOPIC_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const TAG_PATTERN = /^[A-Za-z0-9._-]{1,32}$/u;
const RESERVED_TOPICS = new Set([
  "v1",
  "metrics",
  "config",
  "account",
  "settings",
  "static",
  "docs",
]);

function rejectHeader(label: string): never {
  throw new IntegrationError("VALIDATION_ERROR", `Invalid ntfy ${label}`);
}

export function assertNtfyHeaderValue(value: string, label: string): string {
  if (value.length === 0 || /[\u0000-\u001F\u007F]/u.test(value)) rejectHeader(label);
  return value;
}

export function assertNtfyTopic(value: string): string {
  const topic = value.trim();
  if (!TOPIC_PATTERN.test(topic) || topic.length > NTFY_TOPIC_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid ntfy topic");
  if (RESERVED_TOPICS.has(topic.toLocaleLowerCase("und")))
    throw new IntegrationError("VALIDATION_ERROR", "Reserved ntfy topic");
  return topic;
}

export function assertNtfyPriority(value: string): NtfyPriority {
  if (!(NTFY_PRIORITIES as readonly string[]).includes(value))
    throw new IntegrationError("VALIDATION_ERROR", "Invalid ntfy priority");
  return value as NtfyPriority;
}

export function assertNtfyTitle(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const title = value.trim();
  if (title === "") return undefined;
  if (title.length > NTFY_TITLE_MAX) rejectHeader("title");
  return assertNtfyHeaderValue(title, "title");
}

export function assertNtfyMessage(value: string): string {
  if (value.length === 0 || value.length > NTFY_MESSAGE_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Invalid ntfy message");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value))
    throw new IntegrationError("VALIDATION_ERROR", "Invalid ntfy message");
  return value;
}

export function assertNtfyTags(raw: readonly string[] | undefined): readonly string[] {
  if (raw === undefined || raw.length === 0) return [];
  if (raw.length > NTFY_TAG_MAX)
    throw new IntegrationError("VALIDATION_ERROR", "Too many ntfy tags");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of raw) {
    if (!TAG_PATTERN.test(value) || value.length > NTFY_TAG_LENGTH_MAX)
      throw new IntegrationError("VALIDATION_ERROR", "Invalid ntfy tag");
    if (seen.has(value)) continue;
    seen.add(value);
    tags.push(value);
  }
  return tags;
}

export function ntfyPublishPath(topic: string): string {
  return joinAllowlistedPath([assertNtfyTopic(topic)]);
}

export function isNtfyPublishPath(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.includes("/", 1)) return false;
  const topic = pathname.slice(1);
  try {
    assertNtfyTopic(topic);
    return ntfyPublishPath(topic) === pathname;
  } catch {
    return false;
  }
}
