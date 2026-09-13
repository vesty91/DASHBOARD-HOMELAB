import { IntegrationError } from "@dashboard/integrations";
import type { ImmichHttpMethod } from "./types";

export const IMMICH_API_PREFIX = "/api";
export const IMMICH_PING_PATH = "/api/server/ping";
export const IMMICH_VERSION_PATH = "/api/server/version";
export const IMMICH_ABOUT_PATH = "/api/server/about";
export const IMMICH_STORAGE_PATH = "/api/server/storage";
export const IMMICH_STATISTICS_PATH = "/api/server/statistics";

const ALLOWED_PATHS = new Set([
  IMMICH_PING_PATH,
  IMMICH_VERSION_PATH,
  IMMICH_ABOUT_PATH,
  IMMICH_STORAGE_PATH,
  IMMICH_STATISTICS_PATH,
]);

const DENIED_QUERY_KEYS = new Set(["api_key", "apikey", "access_token", "token", "authorization"]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Immich path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertImmichBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Immich base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Immich transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Immich base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Immich base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Immich base URL must be the server origin");
  return parsed;
}

export function assertImmichEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Immich endpoint URL is invalid");
  }
  if (parsed.hash) reject("Immich endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Immich path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Immich method is not allowed");
  const httpMethod = normalizedMethod as ImmichHttpMethod;
  if (httpMethod !== "GET") reject("Immich method is not allowed");
  const keys = [...parsed.searchParams.keys()];
  if (keys.length > 0) reject("Immich Phase 11 endpoints must not use query parameters");
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Immich query parameter ${key} is not allowed`);
  if (!ALLOWED_PATHS.has(parsed.pathname))
    reject("Immich endpoint is not on the Phase 11 allowlist");
}
