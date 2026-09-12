import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { assertSynologyBaseUrl, assertSynologyEndpointAllowed } from "./policy";
import type { SynologyConfig, SynologySecrets } from "./schemas";
import type { SynologyHttpMethod } from "./types";

export const SYNOLOGY_JSON_MAX_BYTES = 256 * 1024;
export const SYNOLOGY_STORAGE_MAX_BYTES = 2 * 1024 * 1024;

export type SynologyRequestFn = IntegrationClientContext<
  SynologyConfig,
  SynologySecrets
>["request"];

export interface SynologyTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly trustedCaPem?: string;
}

export function buildSynologyUrl(baseUrl: string, pathname: string, search?: URLSearchParams): URL {
  const root = assertSynologyBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = search ? search.toString() : "";
  url.hash = "";
  return url;
}

export async function synologyFetch(
  request: SynologyRequestFn,
  ctx: SynologyTransportContext,
  method: SynologyHttpMethod,
  pathname: string,
  options: {
    search?: URLSearchParams;
    body?: string;
    headers?: Readonly<Record<string, string>>;
    maxBodyBytes?: number;
  } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildSynologyUrl(ctx.baseUrl, pathname, options.search);
  assertSynologyEndpointAllowed(method, url);
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    headers["content-length"] = String(Buffer.byteLength(options.body));
  }
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? SYNOLOGY_JSON_MAX_BYTES,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) throw new IntegrationError(result.code, "DSM request failed");
  if (result.status !== 200) {
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "DSM request failed");
  }
  return result;
}
