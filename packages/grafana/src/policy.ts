import { IntegrationError } from "@dashboard/integrations";
import type { GrafanaHttpMethod } from "./types";

export const GRAFANA_HEALTH_PATH = "/api/health";
export const GRAFANA_SEARCH_PATH = "/api/search";
export const GRAFANA_FOLDERS_PATH = "/api/folders";
export const GRAFANA_ALERTS_PATH = "/api/prometheus/grafana/api/v1/alerts";
export const GRAFANA_DATASOURCES_PATH = "/api/datasources";
export const GRAFANA_SEARCH_TYPE = "dash-db";
export const GRAFANA_QUERY_LIMIT_MIN = 1;
export const GRAFANA_QUERY_LIMIT_MAX = 100;

const ALLOWED_GET_PATHS = new Set([
  GRAFANA_HEALTH_PATH,
  GRAFANA_SEARCH_PATH,
  GRAFANA_FOLDERS_PATH,
  GRAFANA_ALERTS_PATH,
  GRAFANA_DATASOURCES_PATH,
]);

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
    reject("Grafana path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertGrafanaBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Grafana base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Grafana transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Grafana base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Grafana base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Grafana base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Grafana query parameters are not allowed");
  return keys;
}

function parseAllowedLimit(raw: string | null): number {
  if (raw === null || !/^(?:[1-9]|[1-9][0-9]|100)$/u.test(raw))
    reject("Grafana limit query parameter is invalid");
  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < GRAFANA_QUERY_LIMIT_MIN ||
    parsed > GRAFANA_QUERY_LIMIT_MAX
  )
    reject("Grafana limit query parameter is invalid");
  return parsed;
}

function assertSearchQuery(url: URL, keys: readonly string[]): void {
  const allowed = new Set(["type", "limit"]);
  for (const key of keys)
    if (!allowed.has(key)) reject(`Grafana query parameter ${key} is not allowed`);
  if (!keys.includes("type") || !keys.includes("limit"))
    reject("Grafana search requires type and limit");
  if (url.searchParams.get("type") !== GRAFANA_SEARCH_TYPE)
    reject("Grafana search type must be dash-db");
  parseAllowedLimit(url.searchParams.get("limit"));
}

function assertFoldersQuery(url: URL, keys: readonly string[]): void {
  for (const key of keys)
    if (key !== "limit") reject(`Grafana query parameter ${key} is not allowed`);
  if (!keys.includes("limit")) reject("Grafana folders require limit");
  parseAllowedLimit(url.searchParams.get("limit"));
}

export function assertGrafanaEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Grafana endpoint URL is invalid");
  }
  if (parsed.hash) reject("Grafana endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Grafana path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Grafana method is not allowed");
  const httpMethod = normalizedMethod as GrafanaHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Grafana query parameter ${key} is not allowed`);
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Grafana endpoint is not on the Phase 18 allowlist");
      if (parsed.pathname === GRAFANA_SEARCH_PATH) {
        assertSearchQuery(parsed, keys);
        return;
      }
      if (parsed.pathname === GRAFANA_FOLDERS_PATH) {
        assertFoldersQuery(parsed, keys);
        return;
      }
      if (keys.length > 0) reject("Grafana Phase 18 endpoints must not use query parameters");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
