import { IntegrationError } from "@dashboard/integrations";
import type { ProwlarrHttpMethod } from "./types";

export const PROWLARR_SYSTEM_STATUS_PATH = "/api/v1/system/status";
export const PROWLARR_HEALTH_PATH = "/api/v1/health";
export const PROWLARR_INDEXER_PATH = "/api/v1/indexer";
export const PROWLARR_INDEXERSTATUS_PATH = "/api/v1/indexerstatus";

const ALLOWED_GET_PATHS = new Set([
  PROWLARR_SYSTEM_STATUS_PATH,
  PROWLARR_HEALTH_PATH,
  PROWLARR_INDEXER_PATH,
  PROWLARR_INDEXERSTATUS_PATH,
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
    reject("Prowlarr path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertProwlarrBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Prowlarr base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Prowlarr transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Prowlarr base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Prowlarr base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Prowlarr base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Prowlarr query parameters are not allowed");
  return keys;
}

export function assertProwlarrEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Prowlarr endpoint URL is invalid");
  }
  if (parsed.hash) reject("Prowlarr endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Prowlarr path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Prowlarr method is not allowed");
  const httpMethod = normalizedMethod as ProwlarrHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Prowlarr query parameter ${key} is not allowed`);
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Prowlarr endpoint is not on the Phase 18 allowlist");
      if (keys.length > 0) reject("Prowlarr Phase 18 endpoints must not use query parameters");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
