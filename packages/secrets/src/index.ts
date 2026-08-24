/**
 * Encryption, decryption and redaction primitives.
 *
 * Phase 1 intentionally exposes only a typed bootstrap marker.
 * Codex must implement this package according to docs/ and AGENTS.md.
 */
export const SecretsPackage = {
  name: "@dashboard/secrets",
  phase: "bootstrap",
} as const;
