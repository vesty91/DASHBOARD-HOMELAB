import { IntegrationError } from "@dashboard/integrations";
import type { SonarrHttpMethod } from "./types";

export const SONARR_SYSTEM_STATUS_PATH = "/api/v3/system/status";
export const SONARR_HEALTH_PATH = "/api/v3/health";
export const SONARR_QUEUE_STATUS_PATH = "/api/v3/queue/status";
export const SONARR_SERIES_PATH = "/api/v3/series";
export const SONARR_DISKSPACE_PATH = "/api/v3/diskspace";

const ALLOWED_GET_PATHS = new Set([
  SONARR_SYSTEM_STATUS_PATH,
  SONARR_HEALTH_PATH,
  SONARR_QUEUE_STATUS_PATH,
  SONARR_SERIES_PATH,
  SONARR_DISKSPACE_PATH,
]);

const DENIED_QUERY_KEYS = new Set([
  "apikey",
  "api_key",
  "access_token",
  "token",
  "authorization",
  "password",
  "ticket",
]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Sonarr path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertSonarrBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Sonarr base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Sonarr transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Sonarr base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Sonarr base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Sonarr base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Sonarr query parameters are not allowed");
  return keys;
}

export function assertSonarrEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Sonarr endpoint URL is invalid");
  }
  if (parsed.hash) reject("Sonarr endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Sonarr path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Sonarr method is not allowed");
  const httpMethod = normalizedMethod as SonarrHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Sonarr query parameter ${key} is not allowed`);
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Sonarr endpoint is not on the Phase 18 allowlist");
      if (keys.length > 0) reject("Sonarr Phase 18 endpoints must not use query parameters");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
