import { IntegrationError } from "@dashboard/integrations";
import type { JellyfinHttpMethod } from "./types";

export const JELLYFIN_SYSTEM_INFO_PATH = "/System/Info";
export const JELLYFIN_SESSIONS_PATH = "/Sessions";
export const JELLYFIN_ACTIVE_WITHIN_SECONDS = 120;
export const JELLYFIN_MAX_ACTIVE_WITHIN_SECONDS = 3_600;

const DENIED_QUERY_KEYS = new Set(["api_key", "apikey", "access_token", "token", "authorization"]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Jellyfin path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertJellyfinBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Jellyfin base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Jellyfin transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Jellyfin base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Jellyfin base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Jellyfin base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Jellyfin query parameters are not allowed");
  return keys;
}

export function assertJellyfinEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Jellyfin endpoint URL is invalid");
  }
  if (parsed.hash) reject("Jellyfin endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Jellyfin path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Jellyfin method is not allowed");
  const httpMethod = normalizedMethod as JellyfinHttpMethod;
  if (httpMethod !== "GET") reject("Jellyfin method is not allowed");

  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Jellyfin query parameter ${key} is not allowed`);

  if (parsed.pathname === JELLYFIN_SYSTEM_INFO_PATH) {
    if (keys.length > 0) reject("Jellyfin System/Info must not use query parameters");
    return;
  }
  if (parsed.pathname === JELLYFIN_SESSIONS_PATH) {
    if (keys.length === 0) return;
    if (keys.length !== 1 || keys[0] !== "activeWithinSeconds")
      reject("Jellyfin Sessions only allows activeWithinSeconds");
    const rawValue = parsed.searchParams.get("activeWithinSeconds") ?? "";
    if (!/^[1-9]\d{0,3}$/u.test(rawValue)) reject("Jellyfin activeWithinSeconds is invalid");
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1 || value > JELLYFIN_MAX_ACTIVE_WITHIN_SECONDS)
      reject("Jellyfin activeWithinSeconds is out of range");
    return;
  }
  reject("Jellyfin endpoint is not on the Phase 10 allowlist");
}
