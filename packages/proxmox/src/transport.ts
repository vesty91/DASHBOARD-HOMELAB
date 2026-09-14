import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { ProxmoxError, mapProxmoxHttpStatus } from "./errors";
import { assertProxmoxBaseUrl, assertProxmoxEndpointAllowed } from "./policy";
import type { ProxmoxConfig, ProxmoxSecrets } from "./schemas";
import type { ProxmoxHttpMethod } from "./types";

export const PROXMOX_JSON_MAX_BYTES = 256 * 1024;
export const PROXMOX_RESOURCES_MAX_BYTES = 512 * 1024;

export type ProxmoxRequestFn = IntegrationClientContext<ProxmoxConfig, ProxmoxSecrets>["request"];

export interface ProxmoxTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly apiToken: string;
  readonly trustedCaPem?: string;
}

export function buildProxmoxUrl(baseUrl: string, pathname: string): URL {
  const root = assertProxmoxBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function proxmoxAuthHeaders(apiToken: string): Readonly<Record<string, string>> {
  if (/[^\u0021-\u007E]/u.test(apiToken))
    throw new IntegrationError("MISCONFIGURED", "Proxmox API token contains control characters");
  const authorization = `PVEAPIToken=${apiToken}`;
  if (/[\u0000-\u001F\u007F]/u.test(authorization))
    throw new IntegrationError(
      "INVALID_RESPONSE",
      "Proxmox Authorization header contains control characters",
    );
  return {
    Authorization: authorization,
    Accept: "application/json",
  };
}

export async function proxmoxFetch(
  request: ProxmoxRequestFn,
  ctx: ProxmoxTransportContext,
  method: ProxmoxHttpMethod,
  pathname: string,
  options: { maxBodyBytes?: number } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildProxmoxUrl(ctx.baseUrl, pathname);
  assertProxmoxEndpointAllowed(method, url);
  const result = await request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? PROXMOX_JSON_MAX_BYTES,
    headers: { ...proxmoxAuthHeaders(ctx.apiToken) },
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest);
  if (!result.ok) {
    if (result.code === "TIMEOUT") throw new ProxmoxError("TIMEOUT", "Proxmox request timed out");
    throw new IntegrationError(result.code, "Proxmox request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "Proxmox response body is oversized");
  if (result.status !== 200) {
    const mapped = mapProxmoxHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "Proxmox request failed");
  }
  return result;
}
