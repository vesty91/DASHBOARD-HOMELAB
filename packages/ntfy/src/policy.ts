import { IntegrationError } from "@dashboard/integrations";
import type { NtfyHttpMethod } from "./types";
import { isNtfyPublishPath } from "./topic";

export const NTFY_HEALTH_PATH = "/v1/health";
export const NTFY_STATS_PATH = "/v1/stats";
export const NTFY_VERSION_PATH = "/v1/version";

const ALLOWED_GET_PATHS = new Set([NTFY_HEALTH_PATH, NTFY_STATS_PATH, NTFY_VERSION_PATH]);

const DENIED_QUERY_KEYS = new Set([
  "api_key",
  "apikey",
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
    reject("ntfy path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertNtfyBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "ntfy base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "ntfy transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "ntfy base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError("MISCONFIGURED", "ntfy base URL must not include query or fragment");
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "ntfy base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) reject("Duplicate ntfy query parameters are not allowed");
  return keys;
}

export function assertNtfyEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("ntfy endpoint URL is invalid");
  }
  if (parsed.hash) reject("ntfy endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("ntfy path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("ntfy method is not allowed");
  const httpMethod = normalizedMethod as NtfyHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`ntfy query parameter ${key} is not allowed`);
  if (keys.length > 0) reject("ntfy endpoints must not use query parameters");
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname)) reject("ntfy endpoint is not on the allowlist");
      return;
    case "POST":
      if (!isNtfyPublishPath(parsed.pathname)) reject("ntfy endpoint is not on the allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
