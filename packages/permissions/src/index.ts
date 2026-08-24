/**
 * RBAC permission resolver and policies.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const PermissionsPackage = {
  name: "@dashboard/permissions",
  phase: "bootstrap",
} as const;
