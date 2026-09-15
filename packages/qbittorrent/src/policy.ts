import { IntegrationError } from "@dashboard/integrations";
import type { QbittorrentHttpMethod } from "./types";

export const QBITTORRENT_LOGIN_PATH = "/api/v2/auth/login";
export const QBITTORRENT_LOGOUT_PATH = "/api/v2/auth/logout";
export const QBITTORRENT_VERSION_PATH = "/api/v2/app/version";
export const QBITTORRENT_TRANSFER_PATH = "/api/v2/transfer/info";
export const QBITTORRENT_TORRENTS_PATH = "/api/v2/torrents/info";
export const QBITTORRENT_TORRENTS_STOP_PATH = "/api/v2/torrents/stop";
export const QBITTORRENT_TORRENTS_START_PATH = "/api/v2/torrents/start";
export const QBITTORRENT_TORRENTS_PAUSE_PATH = "/api/v2/torrents/pause";
export const QBITTORRENT_TORRENTS_RESUME_PATH = "/api/v2/torrents/resume";

const ALLOWED_GET_PATHS = new Set([
  QBITTORRENT_VERSION_PATH,
  QBITTORRENT_TRANSFER_PATH,
  QBITTORRENT_TORRENTS_PATH,
]);

const ALLOWED_POST_PATHS = new Set([
  QBITTORRENT_LOGIN_PATH,
  QBITTORRENT_LOGOUT_PATH,
  QBITTORRENT_TORRENTS_STOP_PATH,
  QBITTORRENT_TORRENTS_START_PATH,
  QBITTORRENT_TORRENTS_PAUSE_PATH,
  QBITTORRENT_TORRENTS_RESUME_PATH,
]);

const DENIED_QUERY_KEYS = new Set([
  "apikey",
  "api_key",
  "access_token",
  "token",
  "authorization",
  "password",
  "username",
  "sid",
  "ticket",
]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("qBittorrent path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertQbittorrentBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "qBittorrent base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "qBittorrent transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError(
      "MISCONFIGURED",
      "qBittorrent base URL must not include credentials",
    );
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "qBittorrent base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "qBittorrent base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate qBittorrent query parameters are not allowed");
  return keys;
}

export function assertQbittorrentEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("qBittorrent endpoint URL is invalid");
  }
  if (parsed.hash) reject("qBittorrent endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("qBittorrent path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("qBittorrent method is not allowed");
  const httpMethod = normalizedMethod as QbittorrentHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`qBittorrent query parameter ${key} is not allowed`);
  if (keys.length > 0) reject("qBittorrent endpoints must not use query parameters");
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("qBittorrent endpoint is not on the allowlist");
      return;
    case "POST":
      if (!ALLOWED_POST_PATHS.has(parsed.pathname))
        reject("qBittorrent endpoint is not on the allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
