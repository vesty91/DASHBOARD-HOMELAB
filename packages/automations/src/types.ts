export const AUTOMATION_TRIGGER_TYPES = ["schedule", "event", "status-transition"] as const;
export type AutomationTriggerType = (typeof AUTOMATION_TRIGGER_TYPES)[number];

export const AUTOMATION_ACTION_TYPES = [
  "ntfy.publish",
  "qbittorrent.pause",
  "qbittorrent.resume",
  "sonarr.refresh-series",
  "sonarr.search-episode",
  "radarr.refresh-movie",
  "radarr.search-movie",
  "proxmox.start",
  "proxmox.shutdown",
  "proxmox.reboot",
  "seerr.approve",
  "seerr.decline",
] as const;
export type AutomationActionType = (typeof AUTOMATION_ACTION_TYPES)[number];

export const AUTOMATION_RUN_STATUSES = [
  "scheduled",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "denied",
  "unknown",
] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const AUTOMATION_CONFIG_MAX_BYTES = 16_384;
export const AUTOMATION_SUMMARY_MAX_BYTES = 2_048;
export const AUTOMATION_COOLDOWN_MIN_SECONDS = 0;
export const AUTOMATION_COOLDOWN_MAX_SECONDS = 86_400;
export const AUTOMATION_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const AUTOMATION_RUN_MAX_PER_RULE = 200;
export const AUTOMATION_NAME_MAX = 100;
export const AUTOMATION_DESCRIPTION_MAX = 2_000;

export const AUTOMATION_TRIGGER_SQL_IN = AUTOMATION_TRIGGER_TYPES.map((value) => `'${value}'`).join(
  ",",
);
export const AUTOMATION_ACTION_SQL_IN = AUTOMATION_ACTION_TYPES.map((value) => `'${value}'`).join(
  ",",
);
export const AUTOMATION_RUN_STATUS_SQL_IN = AUTOMATION_RUN_STATUSES.map(
  (value) => `'${value}'`,
).join(",");
