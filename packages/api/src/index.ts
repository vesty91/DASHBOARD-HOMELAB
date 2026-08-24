/**
 * Typed API boundary and server procedures.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const ApiPackage = {
  name: "@dashboard/api",
  phase: "bootstrap",
} as const;
