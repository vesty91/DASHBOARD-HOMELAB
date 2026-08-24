/**
 * Health checks, status and history.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const MonitoringPackage = {
  name: "@dashboard/monitoring",
  phase: "bootstrap",
} as const;
