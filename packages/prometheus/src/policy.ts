import { IntegrationError } from "@dashboard/integrations";
import type { PrometheusHttpMethod } from "./types";

export const PROMETHEUS_QUERY_PATH = "/api/v1/query";
export const PROMETHEUS_QUERY_RANGE_PATH = "/api/v1/query_range";

const ALLOWED_POST_PATHS = new Set([PROMETHEUS_QUERY_PATH, PROMETHEUS_QUERY_RANGE_PATH]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Prometheus path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

export function assertPrometheusBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Prometheus base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Prometheus transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Prometheus base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Prometheus base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Prometheus base URL must be the server origin");
  return parsed;
}

export function assertPrometheusEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Prometheus endpoint URL is invalid");
  }
  if (parsed.hash) reject("Prometheus endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Prometheus path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "POST") reject("Prometheus method is not allowed");
  const httpMethod = normalizedMethod as PrometheusHttpMethod;
  const keys = [...parsed.searchParams.keys()];
  if (keys.length > 0) reject("Prometheus query endpoints must not use URL query parameters");
  switch (httpMethod) {
    case "POST":
      if (!ALLOWED_POST_PATHS.has(parsed.pathname))
        reject("Prometheus endpoint is not on the Phase 12 allowlist");
      return;
    default: {
      const _exhaustive: never = httpMethod;
      reject(String(_exhaustive));
    }
  }
}
