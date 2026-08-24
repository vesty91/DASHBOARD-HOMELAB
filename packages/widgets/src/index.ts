/**
 * Widget registry and widget contracts.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const WidgetsPackage = {
  name: "@dashboard/widgets",
  phase: "bootstrap",
} as const;
