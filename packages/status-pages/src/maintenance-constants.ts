/** All maintenance instants are stored and compared as UTC. UI timezone mapping is deferred. */
export const MAINTENANCE_NAME_MAX = 120;
export const MAINTENANCE_MIN_DURATION_MS = 60_000;
export const MAINTENANCE_MAX_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const MAINTENANCE_MAX_FUTURE_START_MS = 365 * 24 * 60 * 60 * 1000;
export const MAINTENANCE_MAX_PAST_START_MS = 5 * 60 * 1000;
