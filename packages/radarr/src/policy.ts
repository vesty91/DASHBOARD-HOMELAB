import { IntegrationError } from "@dashboard/integrations";
import { RADARR_COMMAND_PATH, isRadarrCommandPath } from "./command";
import type { RadarrHttpMethod } from "./types";

export { RADARR_COMMAND_PATH };

export const RADARR_SYSTEM_STATUS_PATH = "/api/v3/system/status";
export const RADARR_HEALTH_PATH = "/api/v3/health";
export const RADARR_QUEUE_STATUS_PATH = "/api/v3/queue/status";
export const RADARR_MOVIE_PATH = "/api/v3/movie";
export const RADARR_DISKSPACE_PATH = "/api/v3/diskspace";

const ALLOWED_GET_PATHS = new Set([
  RADARR_SYSTEM_STATUS_PATH,
  RADARR_HEALTH_PATH,
  RADARR_QUEUE_STATUS_PATH,
  RADARR_MOVIE_PATH,
  RADARR_DISKSPACE_PATH,
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
    reject("Radarr path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertRadarrBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Radarr base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Radarr transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Radarr base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Radarr base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Radarr base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Radarr query parameters are not allowed");
  return keys;
}

export function assertRadarrEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Radarr endpoint URL is invalid");
  }
  if (parsed.hash) reject("Radarr endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Radarr path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("Radarr method is not allowed");
  const httpMethod = normalizedMethod as RadarrHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Radarr query parameter ${key} is not allowed`);
  if (keys.length > 0) reject("Radarr endpoints must not use query parameters");
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Radarr endpoint is not on the allowlist");
      return;
    case "POST":
      if (!isRadarrCommandPath(parsed.pathname)) reject("Radarr endpoint is not on the allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
