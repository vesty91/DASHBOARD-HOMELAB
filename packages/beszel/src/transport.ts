import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { BeszelError, mapBeszelHttpStatus } from "./errors";
import { assertBeszelBaseUrl, assertBeszelEndpointAllowed } from "./policy";
import type { BeszelConfig, BeszelSecrets } from "./schemas";
import type { BeszelHttpMethod } from "./types";

export const BESZEL_JSON_MAX_BYTES = 256 * 1024;

export type BeszelRequestFn = IntegrationClientContext<BeszelConfig, BeszelSecrets>["request"];

export interface BeszelTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly trustedCaPem?: string;
}

export function buildBeszelUrl(
  baseUrl: string,
  pathname: string,
  search: Readonly<Record<string, string>> = {},
): URL {
  const root = assertBeszelBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  return url;
}

export function beszelAuthHeaders(token: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(token))
    throw new IntegrationError("INVALID_RESPONSE", "Beszel token contains control characters");
  return {
    Authorization: token,
    Accept: "application/json",
  };
}

export async function beszelFetch(
  request: BeszelRequestFn,
  ctx: BeszelTransportContext,
  method: BeszelHttpMethod,
  pathname: string,
  options: {
    maxBodyBytes?: number;
    search?: Readonly<Record<string, string>>;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildBeszelUrl(ctx.baseUrl, pathname, options.search ?? {});
  assertBeszelEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? BESZEL_JSON_MAX_BYTES,
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new BeszelError("TIMEOUT", "Beszel request timed out");
    throw new IntegrationError(result.code, "Beszel request failed");
  }
  if (result.status !== 200) {
    const mapped = mapBeszelHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Beszel request failed");
  }
  return result;
}
