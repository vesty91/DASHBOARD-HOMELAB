import { IntegrationError } from "@dashboard/integrations";
import type { BeszelHttpMethod } from "./types";

export const BESZEL_AUTH_PATH = "/api/collections/users/auth-with-password";
export const BESZEL_SYSTEMS_PATH = "/api/collections/systems/records";

const ALLOWED_GET_PATHS = new Set([BESZEL_SYSTEMS_PATH]);
const ALLOWED_POST_PATHS = new Set([BESZEL_AUTH_PATH]);
const ALLOWED_QUERY_KEYS = new Set(["page", "perPage", "fields", "skipTotal"]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Beszel path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertBeszelBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Beszel base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Beszel transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Beszel base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Beszel base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Beszel base URL must be the hub origin");
  return parsed;
}

export function assertBeszelEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Beszel endpoint URL is invalid");
  }
  if (parsed.hash) reject("Beszel endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Beszel path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("Beszel method is not allowed");
  const httpMethod = normalizedMethod as BeszelHttpMethod;
  const keys = [...parsed.searchParams.keys()];
  for (const key of keys)
    if (!ALLOWED_QUERY_KEYS.has(key)) reject(`Beszel query parameter ${key} is not allowed`);
  switch (httpMethod) {
    case "GET":
      if (!ALLOWED_GET_PATHS.has(parsed.pathname))
        reject("Beszel endpoint is not on the Phase 12 allowlist");
      return;
    case "POST":
      if (keys.length > 0) reject("Beszel auth must not use query parameters");
      if (!ALLOWED_POST_PATHS.has(parsed.pathname))
        reject("Beszel endpoint is not on the Phase 12 allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
