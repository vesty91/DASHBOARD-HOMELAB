import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { PrometheusError, mapPrometheusHttpStatus } from "./errors";
import { assertPrometheusBaseUrl, assertPrometheusEndpointAllowed } from "./policy";
import type { PrometheusConfig, PrometheusSecrets } from "./schemas";
import type { PrometheusHttpMethod } from "./types";

export const PROMETHEUS_JSON_MAX_BYTES = 256 * 1024;

export type PrometheusRequestFn = IntegrationClientContext<
  PrometheusConfig,
  PrometheusSecrets
>["request"];

export interface PrometheusTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly bearerToken?: string;
  readonly trustedCaPem?: string;
}

export function buildPrometheusUrl(baseUrl: string, pathname: string): URL {
  const root = assertPrometheusBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function prometheusAuthHeaders(
  bearerToken: string | undefined,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (bearerToken === undefined || bearerToken === "") return headers;
  if (/[^\u0021-\u007E]/u.test(bearerToken))
    throw new IntegrationError(
      "MISCONFIGURED",
      "Prometheus bearer token contains control characters",
    );
  const authorization = `Bearer ${bearerToken}`;
  if (/[\u0000-\u001F\u007F]/u.test(authorization))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "Prometheus Authorization header contains control characters",
    );
  return { ...headers, Authorization: authorization };
}

export function encodePrometheusForm(fields: Readonly<Record<string, string>>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) params.set(key, value);
  return params.toString();
}

export async function prometheusFetch(
  request: PrometheusRequestFn,
  ctx: PrometheusTransportContext,
  method: PrometheusHttpMethod,
  pathname: string,
  fields: Readonly<Record<string, string>>,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildPrometheusUrl(ctx.baseUrl, pathname);
  assertPrometheusEndpointAllowed(method, url);
  const body = encodePrometheusForm(fields);
  const result = await request({
    url,
    method,
    body,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? PROMETHEUS_JSON_MAX_BYTES,
    headers: { ...prometheusAuthHeaders(ctx.bearerToken) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT")
      throw new PrometheusError("TIMEOUT", "Prometheus request timed out");
    throw new IntegrationError(result.code, "Prometheus request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Prometheus response body is oversized");
  if (result.status !== 200) {
    const mapped = mapPrometheusHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Prometheus request failed");
  }
  return result;
}
