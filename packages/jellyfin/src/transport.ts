import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { JellyfinError, mapJellyfinHttpStatus } from "./errors";
import { assertJellyfinBaseUrl, assertJellyfinEndpointAllowed } from "./policy";
import type { JellyfinConfig, JellyfinSecrets } from "./schemas";
import type { JellyfinHttpMethod } from "./types";

export const JELLYFIN_JSON_MAX_BYTES = 256 * 1024;
export const JELLYFIN_SESSIONS_MAX_BYTES = 512 * 1024;

export type JellyfinRequestFn = IntegrationClientContext<
  JellyfinConfig,
  JellyfinSecrets
>["request"];

export interface JellyfinTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildJellyfinUrl(baseUrl: string, pathname: string, search?: URLSearchParams): URL {
  const root = assertJellyfinBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = search ? search.toString() : "";
  url.hash = "";
  return url;
}

export function jellyfinAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  return {
    "X-Emby-Token": apiKey,
    Accept: "application/json",
  };
}

export async function jellyfinFetch(
  request: JellyfinRequestFn,
  ctx: JellyfinTransportContext,
  method: JellyfinHttpMethod,
  pathname: string,
  options: {
    search?: URLSearchParams;
    maxBodyBytes?: number;
  } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildJellyfinUrl(ctx.baseUrl, pathname, options.search);
  assertJellyfinEndpointAllowed(method, url);
  const headers = { ...jellyfinAuthHeaders(ctx.apiKey) };
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? JELLYFIN_JSON_MAX_BYTES,
    headers,
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new JellyfinError("TIMEOUT", "Jellyfin request timed out");
    throw new IntegrationError(result.code, "Jellyfin request failed");
  }
  if (result.status !== 200) {
    const mapped = mapJellyfinHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Jellyfin request failed");
  }
  return result;
}
