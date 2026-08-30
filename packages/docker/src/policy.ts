import { IntegrationError } from "@dashboard/integrations";
import { isSupportedDockerApiVersion } from "./api-version";
import type { DockerHttpMethod } from "./types";

export const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
export const DOCKER_CONTAINER_ID_MAX = 64;

const DENIED_SEGMENTS = [
  "archive",
  "export",
  "top",
  "changes",
  "exec",
  "attach",
  "kill",
  "wait",
  "rename",
  "update",
  "resize",
  "commit",
] as const;

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("Docker path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length)
    reject("Duplicate Docker query parameters are not allowed");
  return keys;
}

function requireExactQuery(url: URL, allowed: Readonly<Record<string, RegExp>>): void {
  const keys = uniqueQueryKeys(url);
  for (const key of keys) {
    const pattern = allowed[key];
    if (!pattern) reject(`Unexpected Docker query parameter: ${key}`);
    const value = url.searchParams.get(key) ?? "";
    if (!pattern.test(value)) reject(`Invalid Docker query value for ${key}`);
  }
  for (const key of Object.keys(allowed))
    if (!keys.includes(key) && key !== "since") reject(`Missing Docker query parameter: ${key}`);
}

function parseVersionedContainerPath(pathname: string): {
  version: string;
  remainder: string;
} | null {
  const match = /^\/v(\d+\.\d+)\/containers\/(.+)$/u.exec(pathname);
  if (!match || !match[1] || !match[2]) return null;
  return { version: match[1], remainder: match[2] };
}

export function assertDockerContainerId(value: string): string {
  if (!CONTAINER_ID_PATTERN.test(value))
    throw new IntegrationError(
      "VALIDATION_ERROR",
      "Docker container id must be 64 lowercase hex characters",
    );
  return value;
}

export function assertDockerProxyBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Docker base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Docker transport is HTTP(S) socket proxy only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Docker base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Docker base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Docker base URL must be the socket-proxy root");
  return parsed;
}

export function assertDockerEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("Docker endpoint URL is invalid");
  }
  if (parsed.hash) reject("Docker endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("Docker path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("Docker method is not allowed");
  const httpMethod = normalizedMethod as DockerHttpMethod;
  const pathname = parsed.pathname;
  const lowerPath = pathname.toLocaleLowerCase("und");
  for (const segment of DENIED_SEGMENTS)
    if (lowerPath.split("/").includes(segment)) reject(`Docker endpoint ${segment} is not allowed`);
  if (
    lowerPath.includes("/images") ||
    lowerPath.includes("/volumes") ||
    lowerPath.includes("/networks")
  )
    reject("Docker inventory endpoints are not allowed");
  if (
    lowerPath.includes("/swarm") ||
    lowerPath.includes("/secrets") ||
    lowerPath.includes("/services") ||
    lowerPath.includes("/nodes") ||
    lowerPath.includes("/tasks") ||
    lowerPath.includes("/plugins") ||
    lowerPath.includes("/build") ||
    lowerPath.includes("/commit")
  )
    reject("Docker cluster and image endpoints are not allowed");

  if (httpMethod === "GET" && pathname === "/_ping") {
    if ([...parsed.searchParams.keys()].length > 0)
      reject("Docker ping does not accept query parameters");
    return;
  }
  if (httpMethod === "GET" && pathname === "/version") {
    if ([...parsed.searchParams.keys()].length > 0)
      reject("Docker version does not accept query parameters");
    return;
  }

  const versioned = parseVersionedContainerPath(pathname);
  if (!versioned || !isSupportedDockerApiVersion(versioned.version))
    reject("Docker endpoint is not on the Phase 8 allowlist");

  if (httpMethod === "GET" && versioned.remainder === "json") {
    requireExactQuery(parsed, {
      all: /^true$/u,
      limit: /^(?:[1-9]|[1-9]\d|[12]\d{2})$/u,
    });
    const limit = Number(parsed.searchParams.get("limit"));
    if (!Number.isInteger(limit) || limit < 1 || limit > 200)
      reject("Docker list limit is out of bounds");
    return;
  }

  const containerMatch = /^([a-f0-9]{64})\/(json|stats|logs|start|stop|restart)$/u.exec(
    versioned.remainder,
  );
  if (!containerMatch || !containerMatch[1] || !containerMatch[2])
    reject("Docker container endpoint is not allowed");
  const action = containerMatch[2];
  if (httpMethod === "GET" && action === "json") {
    if ([...parsed.searchParams.keys()].length > 0)
      reject("Docker inspect does not accept query parameters");
    return;
  }
  if (httpMethod === "GET" && action === "stats") {
    requireExactQuery(parsed, { stream: /^false$/u });
    return;
  }
  if (httpMethod === "GET" && action === "logs") {
    const allowed: Record<string, RegExp> = {
      stdout: /^true$/u,
      stderr: /^true$/u,
      timestamps: /^true$/u,
      tail: /^(?:[1-9]|[1-9]\d|[1-4]\d{2}|500)$/u,
      since: /^(?:0|[1-9]\d{0,9})$/u,
    };
    const keys = uniqueQueryKeys(parsed);
    for (const required of ["stdout", "stderr", "timestamps", "tail"])
      if (!keys.includes(required)) reject(`Missing Docker query parameter: ${required}`);
    for (const key of keys) {
      const pattern = allowed[key];
      if (!pattern) reject(`Unexpected Docker query parameter: ${key}`);
      if (!pattern.test(parsed.searchParams.get(key) ?? ""))
        reject(`Invalid Docker query value for ${key}`);
    }
    return;
  }
  if (httpMethod === "POST" && action === "start") {
    if ([...parsed.searchParams.keys()].length > 0)
      reject("Docker start does not accept query parameters");
    return;
  }
  if (httpMethod === "POST" && (action === "stop" || action === "restart")) {
    requireExactQuery(parsed, { t: /^(?:0|[1-9]|[12]\d|30)$/u });
    return;
  }
  reject("Docker endpoint is not on the Phase 8 allowlist");
}
