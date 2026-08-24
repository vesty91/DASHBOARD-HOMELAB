/**
 * Authentication providers and session services.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const AuthPackage = {
  name: "@dashboard/auth",
  phase: "bootstrap",
} as const;
