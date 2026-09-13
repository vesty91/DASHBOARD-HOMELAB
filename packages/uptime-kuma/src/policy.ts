import { IntegrationError } from "@dashboard/integrations";
import type { UptimeKumaHttpMethod } from "./types";

export const UPTIME_KUMA_METRICS_PATH = "/metrics";

const ALLOWED_GET_PATHS = new Set([UPTIME_KUMA_METRICS_PATH]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Uptime Kuma path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertUptimeKumaBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Uptime Kuma base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Uptime Kuma transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Uptime Kuma base URL must not include credentials",
    );
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Uptime Kuma base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Uptime Kuma base URL must be the server origin");
  return parsed;
}

export function assertUptimeKumaEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Uptime Kuma endpoint URL is invalid");
  }
  if (parsed.hash) reject("Uptime Kuma endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Uptime Kuma path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Uptime Kuma method is not allowed");
  const httpMethod = normalizedMethod as UptimeKumaHttpMethod;
  const keys = [...parsed.searchParams.keys()];
  if (keys.length > 0) reject("Uptime Kuma /metrics must not use query parameters");
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Uptime Kuma endpoint is not on the Phase 12 allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
