import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { RadarrError, mapRadarrHttpStatus } from "./errors";
import { assertRadarrBaseUrl, assertRadarrEndpointAllowed } from "./policy";
import type { RadarrConfig, RadarrSecrets } from "./schemas";
import type { RadarrHttpMethod } from "./types";
import { RADARR_COMMAND_PATH, serializeRadarrCommand, type RadarrQueuedCommand } from "./command";

export const RADARR_JSON_MAX_BYTES = 256 * 1024;
export const RADARR_LIST_MAX_BYTES = 512 * 1024;

export type RadarrRequestFn = IntegrationClientContext<RadarrConfig, RadarrSecrets>["request"];

export interface RadarrTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildRadarrUrl(baseUrl: string, pathname: string): URL {
  const root = assertRadarrBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function radarrAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Radarr API key contains control characters");
  if (/[\u0000-\u001F\u007F]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Radarr API key contains control characters");
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export async function radarrFetch(
  request: RadarrRequestFn,
  ctx: RadarrTransportContext,
  method: Exclude<RadarrHttpMethod, "POST">,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildRadarrUrl(ctx.baseUrl, pathname);
  assertRadarrEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? RADARR_JSON_MAX_BYTES,
    headers: { ...radarrAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new RadarrError("TIMEOUT", "Radarr request timed out");
    throw new IntegrationError(result.code, "Radarr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Radarr response body is oversized");
  if (result.status !== 200) {
    const mapped = mapRadarrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Radarr request failed");
  }
  return result;
}

const ALLOWED_COMMAND_HEADERS = new Set(["Accept", "Content-Type", "X-Api-Key"]);

export async function radarrCommand(
  request: RadarrRequestFn,
  ctx: RadarrTransportContext,
  command: RadarrQueuedCommand,
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildRadarrUrl(ctx.baseUrl, RADARR_COMMAND_PATH);
  assertRadarrEndpointAllowed("POST", url);
  const headers: Record<string, string> = {
    ...radarrAuthHeaders(ctx.apiKey),
    "Content-Type": "application/json",
  };
  for (const name of Object.keys(headers)) {
    if (!ALLOWED_COMMAND_HEADERS.has(name))
      throw new IntegrationError("FORBIDDEN", "Radarr header is not allowed");
  }
  const result = await request({
    url,
    method: "POST",
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: RADARR_JSON_MAX_BYTES,
    headers,
    body: serializeRadarrCommand(command),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new RadarrError("TIMEOUT", "Radarr request timed out");
    throw new IntegrationError(result.code, "Radarr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Radarr response body is oversized");
  if (result.status !== 200 && result.status !== 201) {
    const mapped = mapRadarrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Radarr request failed");
  }
  return result;
}
