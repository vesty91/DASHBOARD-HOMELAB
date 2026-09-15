import { IntegrationError } from "@dashboard/integrations";
import type { CustomApiHttpMethod } from "./types";

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
    reject("Custom API path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertCustomApiBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Custom API base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Custom API transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Custom API base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Custom API base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Custom API base URL must be the server origin");
  return parsed;
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Custom API query parameters are not allowed");
  return keys;
}

export function assertCustomApiEndpointAllowed(
  method: string,
  url: string | URL,
  allowedPaths: readonly string[],
): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Custom API endpoint URL is invalid");
  }
  if (parsed.hash) reject("Custom API endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Custom API path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") reject("Custom API method is not allowed");
  const httpMethod = normalizedMethod as CustomApiHttpMethod;
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`Custom API query parameter ${key} is not allowed`);
  const allow = new Set(allowedPaths);
  switch (httpMethod) {
    case "GET":
      if (!allow.has(parsed.pathname)) reject("Custom API endpoint is not on the allowlist");
      if (keys.length > 0) reject("Custom API endpoints must not use query parameters");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
