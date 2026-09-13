import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { UptimeKumaError, mapUptimeKumaHttpStatus } from "./errors";
import { assertUptimeKumaBaseUrl, assertUptimeKumaEndpointAllowed } from "./policy";
import type { UptimeKumaConfig, UptimeKumaSecrets } from "./schemas";
import type { UptimeKumaHttpMethod } from "./types";

export const UPTIME_KUMA_METRICS_MAX_BYTES = 256 * 1024;

export type UptimeKumaRequestFn = IntegrationClientContext<
  UptimeKumaConfig,
  UptimeKumaSecrets
>["request"];

export interface UptimeKumaTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildUptimeKumaUrl(baseUrl: string, pathname: string): URL {
  const root = assertUptimeKumaBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function uptimeKumaAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Uptime Kuma API key contains control characters");
  const encoded = Buffer.from(`:${apiKey}`, "utf8").toString("base64");
  const authorization = `Basic ${encoded}`;
  if (/[\u0000-\u001F\u007F]/u.test(authorization))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "Uptime Kuma Authorization header contains control characters",
    );
  return {
    Authorization: authorization,
    Accept: "text/plain",
  };
}

export async function uptimeKumaFetch(
  request: UptimeKumaRequestFn,
  ctx: UptimeKumaTransportContext,
  method: UptimeKumaHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildUptimeKumaUrl(ctx.baseUrl, pathname);
  assertUptimeKumaEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? UPTIME_KUMA_METRICS_MAX_BYTES,
    headers: { ...uptimeKumaAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT")
      throw new UptimeKumaError("TIMEOUT", "Uptime Kuma request timed out");
    throw new IntegrationError(result.code, "Uptime Kuma request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Uptime Kuma metrics body is oversized");
  if (result.status !== 200) {
    const mapped = mapUptimeKumaHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Uptime Kuma request failed");
  }
  return result;
}
