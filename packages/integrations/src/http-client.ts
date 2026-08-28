import http from "node:http";
import https from "node:https";
import net from "node:net";
import { performance } from "node:perf_hooks";
import {
  isAllowedHealthAddress,
  systemResolver,
  type AddressResolver,
} from "@dashboard/monitoring";
import { classifyHttpStatus, type IntegrationErrorCode } from "./errors";
import { isBlockedHostname, parseIntegrationUrl } from "./urls";

export const DEFAULT_TIMEOUT_MS = 8_000;
export const MIN_TIMEOUT_MS = 500;
export const MAX_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;
export const INTEGRATION_USER_AGENT = "Dashboard-Integrations/1";
export const MAX_RETRY_DELAY_MS = 2_000;
const FALLBACK_RETRY_AFTER_MS = 100;

export type { AddressResolver };

export interface SecureHttpRequest {
  url: string | URL;
  method?: "GET" | "HEAD" | "POST";
  headers?: Readonly<Record<string, string>>;
  body?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  verifyTls?: boolean;
  allowedSchemes?: readonly string[];
  maxRedirects?: number;
  maxRetries?: number;
  resolver?: AddressResolver;
  allowAddress?: (address: string) => boolean;
}

export type SecureHttpResult =
  | { ok: true; status: number; body: Buffer; latencyMs: number; retryAfterMs?: number }
  | { ok: false; code: IntegrationErrorCode; latencyMs: number };

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - performance.now());
}

function clampTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, value));
}

function headerLine(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseRetryAfterMs(value: string | string[] | undefined): number {
  const raw = headerLine(value);
  if (!raw) return FALLBACK_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_RETRY_DELAY_MS, seconds * 1000);
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, date - Date.now()));
  return FALLBACK_RETRY_AFTER_MS;
}

function sleep(ms: number, deadline: number): Promise<void> {
  const wait = Math.min(ms, remainingMs(deadline));
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, wait);
    timer.unref?.();
  });
}

async function resolveAddresses(
  hostname: string,
  started: number,
  deadline: number,
  resolver: AddressResolver,
): Promise<readonly { address: string; family: 4 | 6 }[] | SecureHttpResult> {
  const family = net.isIP(hostname);
  if (family === 4 || family === 6) return [{ address: hostname, family: family === 4 ? 4 : 6 }];
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      resolver(hostname),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
          remainingMs(deadline),
        );
      }),
    ]);
    return addresses;
  } catch (error) {
    const timedOut =
      (error as { code?: unknown }).code === "ETIMEDOUT" || performance.now() >= deadline;
    return {
      ok: false,
      code: timedOut ? "TIMEOUT" : "DNS_ERROR",
      latencyMs: Math.max(0, Math.round(performance.now() - started)),
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function onceRequest(
  options: SecureHttpRequest,
  started: number,
  deadline: number,
): Promise<SecureHttpResult> {
  const latency = () => Math.max(0, Math.round(performance.now() - started));
  const fail = (code: IntegrationErrorCode): SecureHttpResult => ({
    ok: false,
    code,
    latencyMs: latency(),
  });
  let parsed: URL;
  try {
    parsed = parseIntegrationUrl(
      typeof options.url === "string" ? options.url : options.url.toString(),
      options.allowedSchemes ?? ["http:", "https:"],
    );
  } catch {
    return Promise.resolve(fail("MISCONFIGURED"));
  }
  if (isBlockedHostname(parsed.hostname)) return Promise.resolve(fail("TARGET_BLOCKED"));
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const verifyTls = options.verifyTls !== false;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const method = options.method ?? "GET";
  const resolver = options.resolver ?? systemResolver;
  const allow = options.allowAddress ?? isAllowedHealthAddress;

  return (async () => {
    const resolved = await resolveAddresses(hostname, started, deadline, resolver);
    if ("ok" in resolved && resolved.ok === false) return resolved;
    const addresses = resolved as readonly { address: string; family: 4 | 6 }[];
    if (!addresses.length || addresses.some(({ address }) => !allow(address)))
      return fail("TARGET_BLOCKED");
    const pinned = [...addresses].sort((left, right) =>
      left.address.localeCompare(right.address),
    )[0]!;
    const client = parsed.protocol === "https:" ? https : http;
    const insecureAgent =
      parsed.protocol === "https:" && !verifyTls
        ? new https.Agent({ rejectUnauthorized: false })
        : undefined;
    const headers: http.OutgoingHttpHeaders = {
      "user-agent": INTEGRATION_USER_AGENT,
      accept: "application/json, */*;q=0.8",
      ...options.headers,
    };
    if (performance.now() >= deadline) return fail("TIMEOUT");
    return await new Promise<SecureHttpResult>((resolve) => {
      const session: {
        settled: boolean;
        response?: http.IncomingMessage;
        request?: http.ClientRequest;
        timer?: ReturnType<typeof setTimeout>;
      } = { settled: false };
      const finish = (result: SecureHttpResult) => {
        if (session.settled) return;
        session.settled = true;
        if (session.timer !== undefined) clearTimeout(session.timer);
        session.response?.destroy();
        session.request?.destroy();
        insecureAgent?.destroy();
        resolve(result);
      };
      const requestOptions: https.RequestOptions = {
        method,
        headers,
        timeout: remainingMs(deadline),
        lookup: (
          _hostname: string,
          _lookupOptions: object,
          callback: (error: null, address: string, family: number) => void,
        ) => callback(null, pinned.address, pinned.family),
      };
      Object.assign(requestOptions, { autoSelectFamily: false });
      if (parsed.protocol === "https:" && !net.isIP(hostname)) requestOptions.servername = hostname;
      if (insecureAgent) requestOptions.agent = insecureAgent;
      const request = client.request(parsed, requestOptions, (response) => {
        session.response = response;
        const chunks: Buffer[] = [];
        let size = 0;
        const retryAfterMs =
          response.statusCode === 429
            ? parseRetryAfterMs(response.headers["retry-after"])
            : undefined;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBodyBytes) {
            finish(fail("INVALID_RESPONSE"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          finish({
            ok: true,
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks),
            latencyMs: latency(),
            ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
          });
        });
        response.on("error", () => finish(fail("UNREACHABLE")));
      });
      session.request = request;
      session.timer = setTimeout(() => {
        request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
        session.response?.destroy();
        finish(fail("TIMEOUT"));
      }, remainingMs(deadline));
      request.on("timeout", () =>
        request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
      );
      request.on("error", (error: NodeJS.ErrnoException) => {
        const code = error.code ?? "";
        if (code === "ETIMEDOUT") finish(fail("TIMEOUT"));
        else if (
          code.startsWith("ERR_TLS") ||
          code.includes("CERT") ||
          code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
        )
          finish(fail("TLS_ERROR"));
        else finish(fail("UNREACHABLE"));
      });
      if (options.body && method !== "HEAD") request.write(options.body);
      request.end();
    });
  })();
}

export async function secureRequest(options: SecureHttpRequest): Promise<SecureHttpResult> {
  const timeoutMs = clampTimeout(options.timeoutMs);
  const started = performance.now();
  const deadline = started + timeoutMs;
  const maxRetries = Math.max(0, Math.min(2, options.maxRetries ?? 0));
  const maxRedirects = options.maxRedirects ?? 0;
  if (maxRedirects !== 0) return { ok: false, code: "MISCONFIGURED", latencyMs: 0 };
  let attempt = 0;
  let last: SecureHttpResult = { ok: false, code: "UNKNOWN", latencyMs: 0 };
  while (attempt <= maxRetries) {
    last = await onceRequest(options, started, deadline);
    const retryable =
      (!last.ok && last.code === "TIMEOUT") ||
      (last.ok && [429, 502, 503, 504].includes(last.status));
    if (!retryable || attempt === maxRetries || performance.now() >= deadline) return last;
    const retryAfter =
      last.ok && last.status === 429
        ? Math.min(last.retryAfterMs ?? FALLBACK_RETRY_AFTER_MS, remainingMs(deadline))
        : 50 * (attempt + 1);
    attempt += 1;
    await sleep(retryAfter, deadline);
  }
  return last;
}

export function parseJsonBody(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new Error("invalid-json");
  }
}

export function mapHttpResult(
  result: SecureHttpResult,
):
  | { ok: true; status: number; body: Buffer; latencyMs: number }
  | { ok: false; code: IntegrationErrorCode; latencyMs: number } {
  if (!result.ok) return result;
  const classified = classifyHttpStatus(result.status);
  if (classified) return { ok: false, code: classified, latencyMs: result.latencyMs };
  if (result.status >= 300 && result.status < 400)
    return { ok: false, code: "INVALID_RESPONSE", latencyMs: result.latencyMs };
  return result;
}

export { isAllowedHealthAddress as isAllowedIntegrationAddress };
