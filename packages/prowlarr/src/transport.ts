import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { ProwlarrError, mapProwlarrHttpStatus } from "./errors";
import { assertProwlarrBaseUrl, assertProwlarrEndpointAllowed } from "./policy";
import type { ProwlarrConfig, ProwlarrSecrets } from "./schemas";
import type { ProwlarrHttpMethod } from "./types";

export const PROWLARR_JSON_MAX_BYTES = 256 * 1024;
export const PROWLARR_LIST_MAX_BYTES = 512 * 1024;

export type ProwlarrRequestFn = IntegrationClientContext<
  ProwlarrConfig,
  ProwlarrSecrets
>["request"];

export interface ProwlarrTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildProwlarrUrl(baseUrl: string, pathname: string): URL {
  const root = assertProwlarrBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function prowlarrAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Prowlarr API key contains control characters");
  if (/[\u0000-\u001F\u007F]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Prowlarr API key contains control characters");
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export async function prowlarrFetch(
  request: ProwlarrRequestFn,
  ctx: ProwlarrTransportContext,
  method: ProwlarrHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildProwlarrUrl(ctx.baseUrl, pathname);
  assertProwlarrEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? PROWLARR_JSON_MAX_BYTES,
    headers: { ...prowlarrAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new ProwlarrError("TIMEOUT", "Prowlarr request timed out");
    throw new IntegrationError(result.code, "Prowlarr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Prowlarr response body is oversized");
  if (result.status !== 200) {
    const mapped = mapProwlarrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Prowlarr request failed");
  }
  return result;
}
