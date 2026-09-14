import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { GrafanaError, mapGrafanaHttpStatus } from "./errors";
import { assertGrafanaBaseUrl, assertGrafanaEndpointAllowed } from "./policy";
import type { GrafanaConfig, GrafanaSecrets } from "./schemas";
import type { GrafanaHttpMethod } from "./types";

export const GRAFANA_JSON_MAX_BYTES = 256 * 1024;
export const GRAFANA_LIST_MAX_BYTES = 512 * 1024;

export type GrafanaRequestFn = IntegrationClientContext<GrafanaConfig, GrafanaSecrets>["request"];

export interface GrafanaTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly serviceAccountToken: string;
  readonly trustedCaPem?: string;
}

export function buildGrafanaUrl(
  baseUrl: string,
  pathname: string,
  query: Readonly<Record<string, string>> = {},
): URL {
  const root = assertGrafanaBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

export function grafanaAuthHeaders(serviceAccountToken: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(serviceAccountToken))
    throw new IntegrationError(
      "MISCONFIGURED",
      "Grafana service account token contains control characters",
    );
  const authorization = `Bearer ${serviceAccountToken}`;
  if (/[\u0000-\u001F\u007F]/u.test(authorization))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "Grafana Authorization header contains control characters",
    );
  return {
    Authorization: authorization,
    Accept: "application/json",
  };
}

export async function grafanaFetch(
  request: GrafanaRequestFn,
  ctx: GrafanaTransportContext,
  method: GrafanaHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number; query?: Readonly<Record<string, string>> } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildGrafanaUrl(ctx.baseUrl, pathname, options.query ?? {});
  assertGrafanaEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? GRAFANA_JSON_MAX_BYTES,
    headers: { ...grafanaAuthHeaders(ctx.serviceAccountToken) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new GrafanaError("TIMEOUT", "Grafana request timed out");
    throw new IntegrationError(result.code, "Grafana request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Grafana response body is oversized");
  if (result.status !== 200) {
    const mapped = mapGrafanaHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Grafana request failed");
  }
  return result;
}
