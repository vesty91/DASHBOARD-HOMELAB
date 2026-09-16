export const RESERVED_STATUS_PAGE_SLUGS = new Set([
  "api",
  "admin",
  "login",
  "logout",
  "setup",
  "account",
  "boards",
  "apps",
  "integrations",
  "notifications",
  "incidents",
  "forbidden",
  "offline",
  "status",
  "health",
  "ready",
  "metrics",
  "backup",
  "automations",
  "oidc",
  "realtime",
  "worker",
  "assets",
  "static",
  "public",
  "private",
  "new",
  "edit",
  "create",
  "delete",
  "settings",
  "security",
  "groups",
  "users",
  "library",
]);

export const STATUS_PAGE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function normalizeStatusPageSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isReservedStatusPageSlug(slug: string): boolean {
  return RESERVED_STATUS_PAGE_SLUGS.has(slug);
}
