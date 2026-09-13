import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { ImmichError, mapImmichHttpStatus } from "./errors";
import { assertImmichBaseUrl, assertImmichEndpointAllowed } from "./policy";
import type { ImmichConfig, ImmichSecrets } from "./schemas";
import type { ImmichHttpMethod } from "./types";

export const IMMICH_JSON_MAX_BYTES = 64 * 1024;

export type ImmichRequestFn = IntegrationClientContext<ImmichConfig, ImmichSecrets>["request"];

export interface ImmichTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildImmichUrl(baseUrl: string, pathname: string): URL {
  const root = assertImmichBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function immichAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  return {
    "x-api-key": apiKey,
    Accept: "application/json",
  };
}

export async function immichFetch(
  request: ImmichRequestFn,
  ctx: ImmichTransportContext,
  method: ImmichHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildImmichUrl(ctx.baseUrl, pathname);
  assertImmichEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? IMMICH_JSON_MAX_BYTES,
    headers: { ...immichAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new ImmichError("TIMEOUT", "Immich request timed out");
    throw new IntegrationError(result.code, "Immich request failed");
  }
  if (result.status !== 200) {
    const mapped = mapImmichHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Immich request failed");
  }
  return result;
}
