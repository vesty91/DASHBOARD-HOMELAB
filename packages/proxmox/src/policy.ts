import { IntegrationError } from "@dashboard/integrations";
import type { ProxmoxHttpMethod } from "./types";

export const PROXMOX_VERSION_PATH = "/api2/json/version";
export const PROXMOX_CLUSTER_STATUS_PATH = "/api2/json/cluster/status";
export const PROXMOX_CLUSTER_RESOURCES_PATH = "/api2/json/cluster/resources";

const ALLOWED_GET_PATHS = new Set([
  PROXMOX_VERSION_PATH,
  PROXMOX_CLUSTER_STATUS_PATH,
  PROXMOX_CLUSTER_RESOURCES_PATH,
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
    reject("Proxmox path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertProxmoxBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Proxmox base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Proxmox transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Proxmox base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Proxmox base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Proxmox base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Proxmox query parameters are not allowed");
  return keys;
}

export function assertProxmoxEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Proxmox endpoint URL is invalid");
  }
  if (parsed.hash) reject("Proxmox endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Proxmox path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Proxmox method is not allowed");
  const httpMethod = normalizedMethod as ProxmoxHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Proxmox query parameter ${key} is not allowed`);
  if (keys.length > 0) reject("Proxmox Phase 18 endpoints must not use query parameters");
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Proxmox endpoint is not on the Phase 18 allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
