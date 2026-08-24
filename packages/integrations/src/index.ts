/**
 * Integration registry, adapters and clients.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const IntegrationsPackage = {
  name: "@dashboard/integrations",
  phase: "bootstrap",
} as const;
