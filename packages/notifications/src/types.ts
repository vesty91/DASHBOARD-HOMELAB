export const NOTIFICATION_SEVERITIES = ["info", "success", "warning", "error", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const NOTIFICATION_CATEGORIES = [
  "integration",
  "automation",
  "system",
  "security",
  "backup",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_SOURCE_TYPES = [
  "integration",
  "automation",
  "system",
  "security",
  "backup",
  "incident",
] as const;
export type NotificationSourceType = (typeof NOTIFICATION_SOURCE_TYPES)[number];

export const INCIDENT_KINDS = ["availability"] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_STATUSES = ["open", "resolved"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_EVENT_TYPES = ["opened", "resolved", "note"] as const;
export type IncidentEventType = (typeof INCIDENT_EVENT_TYPES)[number];

export const NOTIFICATION_TITLE_MAX = 200;
export const NOTIFICATION_BODY_MAX = 2_000;
export const NOTIFICATION_DEDUP_KEY_MAX = 128;
export const NOTIFICATION_DEDUP_WINDOW_MS = 15 * 60 * 1000;
export const NOTIFICATION_MAX_PER_USER = 500;
export const NOTIFICATION_READ_OR_DISMISSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_UNREAD_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const NOTIFICATION_LIST_DEFAULT_LIMIT = 50;
export const NOTIFICATION_LIST_MAX_LIMIT = 100;
