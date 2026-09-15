import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { SeerrError, mapSeerrHttpStatus } from "./errors";
import { assertSeerrBaseUrl, assertSeerrEndpointAllowed } from "./policy";
import type { SeerrConfig, SeerrSecrets } from "./schemas";
import type { SeerrHttpMethod } from "./types";

export const SEERR_JSON_MAX_BYTES = 256 * 1024;

export type SeerrRequestFn = IntegrationClientContext<SeerrConfig, SeerrSecrets>["request"];

export interface SeerrTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildSeerrUrl(baseUrl: string, pathname: string): URL {
  const root = assertSeerrBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function seerrAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Seerr API key contains control characters");
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export async function seerrFetch(
  request: SeerrRequestFn,
  ctx: SeerrTransportContext,
  method: SeerrHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildSeerrUrl(ctx.baseUrl, pathname);
  assertSeerrEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? SEERR_JSON_MAX_BYTES,
    headers: { ...seerrAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new SeerrError("TIMEOUT", "Seerr request timed out");
    throw new IntegrationError(result.code, "Seerr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Seerr response body is oversized");
  if (result.status !== 200) {
    const mapped = mapSeerrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Seerr request failed");
  }
  return result;
}
