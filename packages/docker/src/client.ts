import {
  IntegrationError,
  classifyHttpStatus,
  parseJsonBody,
  type IntegrationClientContext,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { negotiateDockerApiVersion } from "./api-version";
import { decodeDockerLogs, DOCKER_LOGS_MAX_BYTES } from "./logs";
import { assertDockerEndpointAllowed, assertDockerProxyBaseUrl } from "./policy";
import {
  dockerInspectSchema,
  dockerVersionResponseSchema,
  type DockerConfig,
  type DockerSecrets,
} from "./schemas";
import type {
  DockerActionResult,
  DockerHttpMethod,
  DockerLogResult,
  DockerSystemInfo,
} from "./types";

export const DOCKER_JSON_MAX_BYTES = 256 * 1024;
export const DOCKER_BOOTSTRAP_MAX_BYTES = 16 * 1024;
export const VERSION_CACHE_TTL_MS = 45_000;
export const CONTAINER_CACHE_TTL_MS = 2_000;

export type DockerRequestFn = IntegrationClientContext<DockerConfig, DockerSecrets>["request"];

export interface DockerClientContext {
  readonly baseUrl: string;
  readonly verifyTls: boolean;
  readonly timeoutMs: number;
  readonly trustedCaPem?: string;
  readonly request: DockerRequestFn;
}

export function dockerContextFromIntegration(
  ctx: IntegrationClientContext<DockerConfig, DockerSecrets>,
): DockerClientContext {
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    request: ctx.request,
    ...(ctx.config.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.config.trustedCaPem }),
  };
}

function failHttp(result: SecureHttpResult, fallback: string): never {
  if (!result.ok) throw new IntegrationError(result.code, fallback);
  if (result.status === 409) throw new IntegrationError("CONFLICT", fallback);
  if (result.status === 304) throw new IntegrationError("CONFLICT", fallback);
  const classified = classifyHttpStatus(result.status);
  throw new IntegrationError(classified ?? "INVALID_RESPONSE", fallback);
}

function buildUrl(baseUrl: string, pathname: string, search?: URLSearchParams): URL {
  const root = assertDockerProxyBaseUrl(baseUrl);
  const url = new URL(root.href);
  url.pathname = pathname;
  url.search = search ? search.toString() : "";
  url.hash = "";
  return url;
}

async function dockerFetch(
  ctx: DockerClientContext,
  method: DockerHttpMethod,
  pathname: string,
  options: { search?: URLSearchParams; maxBodyBytes: number; onBodyLimit?: "truncate" },
): Promise<Extract<SecureHttpResult, { ok: true }>> {
  const url = buildUrl(ctx.baseUrl, pathname, options.search);
  assertDockerEndpointAllowed(method, url);
  const result = await ctx.request({
    url,
    method,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedSchemes: ["http:", "https:"],
    maxRetries: 0,
    maxRedirects: 0,
    maxBodyBytes: options.maxBodyBytes,
    ...(options.onBodyLimit === undefined ? {} : { onBodyLimit: options.onBodyLimit }),
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  });
  if (!result.ok) throw new IntegrationError(result.code, "Docker request failed");
  return result;
}

export async function pingDocker(ctx: DockerClientContext): Promise<number> {
  const result = await dockerFetch(ctx, "GET", "/_ping", {
    maxBodyBytes: DOCKER_BOOTSTRAP_MAX_BYTES,
  });
  if (result.status !== 200) failHttp(result, "Docker ping failed");
  const body = result.body.toString("utf8").trim();
  if (body && body.toLocaleUpperCase("und") !== "OK")
    throw new IntegrationError("INVALID_RESPONSE", "Docker ping returned an unexpected body");
  return result.latencyMs;
}

export async function readDockerVersion(ctx: DockerClientContext): Promise<DockerSystemInfo> {
  const result = await dockerFetch(ctx, "GET", "/version", {
    maxBodyBytes: DOCKER_BOOTSTRAP_MAX_BYTES,
  });
  if (result.status !== 200) failHttp(result, "Docker version failed");
  let payload: unknown;
  try {
    payload = parseJsonBody(result.body);
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Docker version is not valid JSON");
  }
  const parsed = dockerVersionResponseSchema.safeParse(payload);
  if (!parsed.success)
    throw new IntegrationError("INVALID_RESPONSE", "Docker version payload is invalid");
  const negotiatedApiVersion = negotiateDockerApiVersion({
    serverApiVersion: parsed.data.ApiVersion,
    ...(parsed.data.MinAPIVersion ? { serverMinApiVersion: parsed.data.MinAPIVersion } : {}),
  });
  return {
    engineVersion: parsed.data.Version,
    serverApiVersion: parsed.data.ApiVersion,
    serverMinApiVersion: parsed.data.MinAPIVersion ?? null,
    negotiatedApiVersion,
    os: parsed.data.Os ?? null,
    arch: parsed.data.Arch ?? null,
  };
}

export async function dockerGetJson(
  ctx: DockerClientContext,
  pathname: string,
  search?: URLSearchParams,
): Promise<{ status: number; body: unknown; latencyMs: number }> {
  const result = await dockerFetch(ctx, "GET", pathname, {
    ...(search ? { search } : {}),
    maxBodyBytes: DOCKER_JSON_MAX_BYTES,
  });
  if (result.status !== 200) failHttp(result, "Docker JSON request failed");
  try {
    return { status: result.status, body: parseJsonBody(result.body), latencyMs: result.latencyMs };
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "Docker returned invalid JSON");
  }
}

export async function dockerGetLogs(
  ctx: DockerClientContext,
  pathname: string,
  search: URLSearchParams,
  tty: boolean,
): Promise<DockerLogResult> {
  const result = await dockerFetch(ctx, "GET", pathname, {
    search,
    maxBodyBytes: DOCKER_LOGS_MAX_BYTES,
    onBodyLimit: "truncate",
  });
  if (result.status === 403)
    throw new IntegrationError(
      "FORBIDDEN",
      "L'accès aux logs n'est pas autorisé par le socket proxy.",
    );
  if (result.status !== 200) failHttp(result, "Docker logs request failed");
  const decoded = decodeDockerLogs(result.body, tty);
  const tail = Number(search.get("tail"));
  return {
    text: decoded.text,
    tail: Number.isInteger(tail) ? tail : 200,
    truncated: decoded.truncated || result.truncated === true,
    tty: decoded.tty,
  };
}

export async function dockerPostAction(
  ctx: DockerClientContext,
  pathname: string,
  search?: URLSearchParams,
): Promise<DockerActionResult> {
  const result = await dockerFetch(ctx, "POST", pathname, {
    ...(search ? { search } : {}),
    maxBodyBytes: DOCKER_BOOTSTRAP_MAX_BYTES,
  });
  if (result.status === 204) return { changed: true };
  if (result.status === 304) return { changed: false };
  if (result.status === 403)
    throw new IntegrationError("FORBIDDEN", "L'action n'est pas autorisée par le socket proxy.");
  failHttp(result, "Docker action failed");
}

export function inspectTty(inspectBody: unknown): boolean {
  const parsed = dockerInspectSchema.safeParse(inspectBody);
  return parsed.success ? parsed.data.Config?.Tty === true : false;
}
