/**
 * Docker-specific client and capability layer.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const DockerPackage = {
  name: "@dashboard/docker",
  phase: "bootstrap",
} as const;
