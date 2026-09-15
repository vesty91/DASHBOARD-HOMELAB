import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { CustomApiError, mapCustomApiHttpStatus } from "./errors";
import { assertCustomApiBaseUrl, assertCustomApiEndpointAllowed } from "./policy";
import type { CustomApiConfig, CustomApiKeyHeader, CustomApiSecrets } from "./schemas";
import type { CustomApiHttpMethod } from "./types";

export const CUSTOM_API_JSON_MAX_BYTES = 256 * 1024;

export type CustomApiRequestFn = IntegrationClientContext<
  CustomApiConfig,
  CustomApiSecrets
>["request"];

export interface CustomApiTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly allowedPaths: readonly string[];
  readonly bearerToken?: string;
  readonly apiKey?: string;
  readonly apiKeyHeader?: CustomApiKeyHeader;
  readonly trustedCaPem?: string;
}

export function buildCustomApiUrl(baseUrl: string, pathname: string): URL {
  const root = assertCustomApiBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function customApiAuthHeaders(
  ctx: Pick<CustomApiTransportContext, "bearerToken" | "apiKey" | "apiKeyHeader">,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (ctx.bearerToken !== undefined && ctx.bearerToken !== "") {
    if (/[^\u0021-\u007E]/u.test(ctx.bearerToken))
      throw new IntegrationError(
        "MISCONFIGURED",
        "Custom API bearer token contains control characters",
      );
    headers.Authorization = `Bearer ${ctx.bearerToken}`;
  }
  if (ctx.apiKey !== undefined && ctx.apiKey !== "" && ctx.apiKeyHeader !== undefined) {
    if (/[^\u0021-\u007E]/u.test(ctx.apiKey))
      throw new IntegrationError("MISCONFIGURED", "Custom API key contains control characters");
    headers[ctx.apiKeyHeader] = ctx.apiKey;
  }
  return headers;
}

export async function customApiFetch(
  request: CustomApiRequestFn,
  ctx: CustomApiTransportContext,
  method: CustomApiHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildCustomApiUrl(ctx.baseUrl, pathname);
  assertCustomApiEndpointAllowed(method, url, ctx.allowedPaths);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? CUSTOM_API_JSON_MAX_BYTES,
    headers: { ...customApiAuthHeaders(ctx) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT")
      throw new CustomApiError("TIMEOUT", "Custom API request timed out");
    throw new IntegrationError(result.code, "Custom API request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Custom API response body is oversized");
  if (result.status !== 200) {
    const mapped = mapCustomApiHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Custom API request failed");
  }
  return result;
}
