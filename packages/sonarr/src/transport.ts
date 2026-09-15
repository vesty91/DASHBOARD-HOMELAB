import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { SonarrError, mapSonarrHttpStatus } from "./errors";
import { assertSonarrBaseUrl, assertSonarrEndpointAllowed } from "./policy";
import type { SonarrConfig, SonarrSecrets } from "./schemas";
import type { SonarrHttpMethod } from "./types";
import { SONARR_COMMAND_PATH, serializeSonarrCommand, type SonarrQueuedCommand } from "./command";

export const SONARR_JSON_MAX_BYTES = 256 * 1024;
export const SONARR_LIST_MAX_BYTES = 512 * 1024;

export type SonarrRequestFn = IntegrationClientContext<SonarrConfig, SonarrSecrets>["request"];

export interface SonarrTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiKey: string;
  readonly trustedCaPem?: string;
}

export function buildSonarrUrl(baseUrl: string, pathname: string): URL {
  const root = assertSonarrBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function sonarrAuthHeaders(apiKey: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Sonarr API key contains control characters");
  if (/[\u0000-\u001F\u007F]/u.test(apiKey))
    throw new IntegrationError("MISCONFIGURED", "Sonarr API key contains control characters");
  return {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
}

export async function sonarrFetch(
  request: SonarrRequestFn,
  ctx: SonarrTransportContext,
  method: Exclude<SonarrHttpMethod, "POST">,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildSonarrUrl(ctx.baseUrl, pathname);
  assertSonarrEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? SONARR_JSON_MAX_BYTES,
    headers: { ...sonarrAuthHeaders(ctx.apiKey) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new SonarrError("TIMEOUT", "Sonarr request timed out");
    throw new IntegrationError(result.code, "Sonarr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Sonarr response body is oversized");
  if (result.status !== 200) {
    const mapped = mapSonarrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Sonarr request failed");
  }
  return result;
}

const ALLOWED_COMMAND_HEADERS = new Set(["Accept", "Content-Type", "X-Api-Key"]);

export async function sonarrCommand(
  request: SonarrRequestFn,
  ctx: SonarrTransportContext,
  command: SonarrQueuedCommand,
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildSonarrUrl(ctx.baseUrl, SONARR_COMMAND_PATH);
  assertSonarrEndpointAllowed("POST", url);
  const headers: Record<string, string> = {
    ...sonarrAuthHeaders(ctx.apiKey),
    "Content-Type": "application/json",
  };
  for (const name of Object.keys(headers)) {
    if (!ALLOWED_COMMAND_HEADERS.has(name))
      throw new IntegrationError("FORBIDDEN", "Sonarr header is not allowed");
  }
  const result = await request({
    url,
    method: "POST",
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: SONARR_JSON_MAX_BYTES,
    headers,
    body: serializeSonarrCommand(command),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new SonarrError("TIMEOUT", "Sonarr request timed out");
    throw new IntegrationError(result.code, "Sonarr request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Sonarr response body is oversized");
  if (result.status !== 200 && result.status !== 201) {
    const mapped = mapSonarrHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Sonarr request failed");
  }
  return result;
}
