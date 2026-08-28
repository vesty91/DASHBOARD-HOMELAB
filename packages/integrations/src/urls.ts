export function parseIntegrationUrl(
  value: string,
  allowedSchemes: readonly string[] = ["http:", "https:"],
): URL {
  const url = new URL(value);
  if (!allowedSchemes.includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error("invalid-url");
  return url;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}
