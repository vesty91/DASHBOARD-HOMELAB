import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { NtfyError, mapNtfyHttpStatus } from "./errors";
import { assertNtfyBaseUrl, assertNtfyEndpointAllowed } from "./policy";
import type { NtfyConfig, NtfySecrets } from "./schemas";
import type { NtfyHttpMethod } from "./types";

export const NTFY_JSON_MAX_BYTES = 256 * 1024;

export type NtfyRequestFn = IntegrationClientContext<NtfyConfig, NtfySecrets>["request"];

export interface NtfyTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly accessToken?: string;
  readonly trustedCaPem?: string;
}

export function buildNtfyUrl(baseUrl: string, pathname: string): URL {
  const root = assertNtfyBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function ntfyAuthHeaders(accessToken?: string): Readonly<Record<string, string>> {
  if (accessToken === undefined || accessToken === "") return { Accept: "application/json" };
  if (/[^\u0021-\u007E]/u.test(accessToken))
    throw new IntegrationError("MISCONFIGURED", "ntfy access token contains control characters");
  const authorization = `Bearer ${accessToken}`;
  if (/[\u0000-\u001F\u007F]/u.test(authorization))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "ntfy Authorization header contains control characters",
    );
  return {
    Authorization: authorization,
    Accept: "application/json",
  };
}

export async function ntfyFetch(
  request: NtfyRequestFn,
  ctx: NtfyTransportContext,
  method: NtfyHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildNtfyUrl(ctx.baseUrl, pathname);
  assertNtfyEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? NTFY_JSON_MAX_BYTES,
    headers: { ...ntfyAuthHeaders(ctx.accessToken) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new NtfyError("TIMEOUT", "ntfy request timed out");
    throw new IntegrationError(result.code, "ntfy request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "ntfy response body is oversized");
  if (result.status !== 200) {
    const mapped = mapNtfyHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "ntfy request failed");
  }
  return result;
}
