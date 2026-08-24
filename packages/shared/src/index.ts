/**
 * Infrastructure-free shared types and utilities.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const SharedPackage = {
  name: "@dashboard/shared",
  phase: "bootstrap",
} as const;
