import { IntegrationError } from "./errors";

export const SAFE_ACTION_HTTP_METHODS = ["POST"] as const;
export type SafeActionHttpMethod = (typeof SAFE_ACTION_HTTP_METHODS)[number];

const PATH_SEGMENT_PATTERN = /^[A-Za-z0-9._:-]+$/u;

export interface AllowlistedHttpRequest {
  readonly method: SafeActionHttpMethod;
  readonly pathname: string;
}

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

export function assertSafeActionHttpMethod(method: string): asserts method is SafeActionHttpMethod {
  if (method !== "POST")
    throw new IntegrationError("FORBIDDEN", "Integration actions must use POST");
}

export function assertSafePathSegment(value: string, label: string): string {
  if (value === "." || value === ".." || !PATH_SEGMENT_PATTERN.test(value))
    throw new IntegrationError("VALIDATION_ERROR", `Invalid ${label}`);
  return value;
}

export function joinAllowlistedPath(segments: readonly string[]): string {
  if (segments.length === 0)
    throw new IntegrationError("VALIDATION_ERROR", "Action path must not be empty");
  for (const [index, segment] of segments.entries())
    assertSafePathSegment(segment, `path segment ${index}`);
  return `/${segments.join("/")}`;
}

export function assertAllowlistedRequest(
  request: { method: string; pathname: string; search?: string },
  allowed: readonly AllowlistedHttpRequest[],
): void {
  assertSafeActionHttpMethod(request.method);
  if (request.search && request.search !== "")
    reject("Query strings are not allowed on integration actions unless explicitly allowlisted");
  if (request.pathname.includes("\\") || /%2f|%2e|%5c/iu.test(request.pathname))
    reject("Encoded path traversal is not allowed");
  const match = allowed.some(
    (entry) => entry.method === request.method && entry.pathname === request.pathname,
  );
  if (!match) reject("Endpoint is not in the integration action allowlist");
}
