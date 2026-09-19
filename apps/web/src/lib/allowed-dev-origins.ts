/**
 * Dev-only hosts allowed for Next.js cross-origin HMR (`allowedDevOrigins`).
 * Defaults stay portable; optional ALLOWED_DEV_ORIGINS adds extra hosts (never commit LAN IPs).
 */
export function parseAllowedDevOrigins(
  raw: string | undefined = process.env.ALLOWED_DEV_ORIGINS,
): string[] {
  const defaults = ["127.0.0.1", "localhost"] as const;
  const extras = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set([...defaults, ...extras])];
}
