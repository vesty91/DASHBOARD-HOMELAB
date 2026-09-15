import {
  classifyHttpStatus,
  IntegrationError,
  type IntegrationClientContext,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { QbittorrentError, mapQbittorrentHttpStatus } from "./errors";
import { assertQbittorrentBaseUrl, assertQbittorrentEndpointAllowed } from "./policy";
import type { QbittorrentConfig, QbittorrentSecrets } from "./schemas";
import { qbittorrentCookieHeader } from "./sid";
import type { QbittorrentHttpMethod } from "./types";

export const QBITTORRENT_JSON_MAX_BYTES = 256 * 1024;
export const QBITTORRENT_LIST_MAX_BYTES = 512 * 1024;
export const QBITTORRENT_TEXT_MAX_BYTES = 4 * 1024;

export type QbittorrentRequestFn = IntegrationClientContext<
  QbittorrentConfig,
  QbittorrentSecrets
>["request"];

export interface QbittorrentTransportContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly username: string;
  readonly password: string;
  readonly trustedCaPem?: string;
}

export function buildQbittorrentUrl(baseUrl: string, pathname: string): URL {
  const root = assertQbittorrentBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = "";
  url.hash = "";
  return url;
}

export function qbittorrentLoginBody(username: string, password: string): string {
  if (/[^\u0021-\u007E]/u.test(username) || /[^\u0021-\u007E]/u.test(password))
    throw new IntegrationError(
      "MISCONFIGURED",
      "qBittorrent credentials contain control characters",
    );
  return new URLSearchParams({ username, password }).toString();
}

function commonRequest(
  ctx: QbittorrentTransportContext,
  method: QbittorrentHttpMethod,
  pathname: string,
  options: {
    maxBodyBytes?: number;
    headers?: Readonly<Record<string, string>>;
    body?: string;
  } = {},
): SecureHttpRequest {
  const url = buildQbittorrentUrl(ctx.baseUrl, pathname);
  assertQbittorrentEndpointAllowed(method, url);
  return {
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes ?? QBITTORRENT_JSON_MAX_BYTES,
    ...(options.headers === undefined ? {} : { headers: { ...options.headers } }),
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  } satisfies SecureHttpRequest;
}

function throwIfFailed(
  result: SecureHttpResult,
  unauthorizedMessage: string,
): Extract<SecureHttpResult, { ok: true }> {
  if (!result.ok) {
    if (result.code === "TIMEOUT")
      throw new QbittorrentError("TIMEOUT", "qBittorrent request timed out");
    throw new IntegrationError(result.code, "qBittorrent request failed");
  }
  if (result.truncated)
    throw new IntegrationError("INVALID_RESPONSE", "qBittorrent response body is oversized");
  if (result.status === 401 || result.status === 403)
    throw new QbittorrentError("UNAUTHORIZED", unauthorizedMessage, result.status);
  if (result.status !== 200) {
    const mapped = mapQbittorrentHttpStatus(result.status);
    if (mapped.kind !== "INVALID_RESPONSE") throw mapped;
    const classified = classifyHttpStatus(result.status);
    throw new IntegrationError(classified ?? "INVALID_RESPONSE", "qBittorrent request failed");
  }
  return result;
}

export async function qbittorrentLogin(
  request: QbittorrentRequestFn,
  ctx: QbittorrentTransportContext,
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const result = await request(
    commonRequest(ctx, "POST", "/api/v2/auth/login", {
      maxBodyBytes: QBITTORRENT_TEXT_MAX_BYTES,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      body: qbittorrentLoginBody(ctx.username, ctx.password),
    }),
  );
  return throwIfFailed(result, "qBittorrent credentials are invalid");
}

export async function qbittorrentLogout(
  request: QbittorrentRequestFn,
  ctx: QbittorrentTransportContext,
  sid: string,
): Promise<void> {
  try {
    await request(
      commonRequest(ctx, "POST", "/api/v2/auth/logout", {
        maxBodyBytes: QBITTORRENT_TEXT_MAX_BYTES,
        headers: {
          Cookie: qbittorrentCookieHeader(sid),
          Accept: "text/plain",
        },
      }),
    );
  } catch (error) {
    void error;
  }
}

export async function qbittorrentPostForm(
  request: QbittorrentRequestFn,
  ctx: QbittorrentTransportContext,
  pathname: string,
  sid: string,
  body: string,
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const result = await request(
    commonRequest(ctx, "POST", pathname, {
      maxBodyBytes: QBITTORRENT_TEXT_MAX_BYTES,
      headers: {
        Cookie: qbittorrentCookieHeader(sid),
        Accept: "text/plain",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }),
  );
  return throwIfFailed(result, "qBittorrent session is invalid");
}

export async function qbittorrentFetch(
  request: QbittorrentRequestFn,
  ctx: QbittorrentTransportContext,
  method: Exclude<QbittorrentHttpMethod, "POST">,
  pathname: string,
  sid: string,
  options: { maxBodyBytes?: number; accept?: string } = {},
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const result = await request(
    commonRequest(ctx, method, pathname, {
      ...(options.maxBodyBytes === undefined ? {} : { maxBodyBytes: options.maxBodyBytes }),
      headers: {
        Cookie: qbittorrentCookieHeader(sid),
        Accept: options.accept ?? "application/json",
      },
    }),
  );
  return throwIfFailed(result, "qBittorrent session is invalid");
}
