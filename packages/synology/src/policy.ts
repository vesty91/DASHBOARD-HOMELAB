import { IntegrationError } from "@dashboard/integrations";
import type { SynologyHttpMethod } from "./types";

export const SYNOLOGY_SESSION_NAME = "DashboardHomelab";
export const SYNOLOGY_DEVICE_NAME = "DashboardHomelab";
export const SYNOLOGY_ENTRY_CGI = "/webapi/entry.cgi";

export const INFO_QUERY =
  "SYNO.API.Auth,SYNO.DSM.Info,SYNO.Core.System,SYNO.Core.System.Utilization,SYNO.Storage.CGI.Storage";

export const ALLOWED_DSM_APIS = [
  "SYNO.API.Info",
  "SYNO.API.Auth",
  "SYNO.DSM.Info",
  "SYNO.Core.System",
  "SYNO.Core.System.Utilization",
  "SYNO.Storage.CGI.Storage",
] as const;

export type AllowedDsmApi = (typeof ALLOWED_DSM_APIS)[number];

const CGI_PATH = /^\/webapi\/entry\.cgi$/u;
const DENIED_QUERY_KEYS = new Set([
  "account",
  "passwd",
  "password",
  "otp",
  "otp_code",
  "syno_otp",
  "_sid",
  "device_id",
  "synotoken",
]);

function reject(message: string): never {
  throw new IntegrationError("FORBIDDEN", message);
}

function assertSafeRawUrl(raw: string): void {
  if (raw.includes("\\") || raw.includes("%5c") || raw.includes("%5C"))
    reject("DSM path backslash is not allowed");
  if (/%2f/iu.test(raw) || /%2e/iu.test(raw)) reject("Encoded path traversal is not allowed");
}

function uniqueQueryKeys(url: URL): readonly string[] {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) reject("Duplicate DSM query parameters are not allowed");
  return keys;
}

function requireExactQuery(url: URL, allowed: Readonly<Record<string, RegExp>>): void {
  const keys = uniqueQueryKeys(url);
  for (const key of keys) {
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`DSM query parameter ${key} is not allowed`);
    const pattern = allowed[key];
    if (!pattern) reject(`Unexpected DSM query parameter: ${key}`);
    if (!pattern.test(url.searchParams.get(key) ?? ""))
      reject(`Invalid DSM query value for ${key}`);
  }
  for (const key of Object.keys(allowed))
    if (!keys.includes(key)) reject(`Missing DSM query parameter: ${key}`);
}

export function assertSynologyBaseUrl(baseUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new IntegrationError("MISCONFIGURED", "Synology base URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new IntegrationError("MISCONFIGURED", "Synology transport is HTTP(S) only");
  if (parsed.username || parsed.password)
    throw new IntegrationError("MISCONFIGURED", "Synology base URL must not include credentials");
  if (parsed.search || parsed.hash)
    throw new IntegrationError(
      "MISCONFIGURED",
      "Synology base URL must not include query or fragment",
    );
  const path = parsed.pathname.replace(/\/+$/u, "");
  if (path !== "")
    throw new IntegrationError("MISCONFIGURED", "Synology base URL must be the DSM origin");
  return parsed;
}

export function isAllowedDsmCgiPath(value: string): boolean {
  const trimmed = value
    .trim()
    .replace(/^\/webapi\//u, "")
    .replace(/^\//u, "");
  return trimmed === "entry.cgi";
}

export function assertSynologyCgiPath(value: string): string {
  if (!isAllowedDsmCgiPath(value))
    throw new IntegrationError("INVALID_RESPONSE", "DSM CGI path is not on the allowlist");
  return SYNOLOGY_ENTRY_CGI;
}

export function assertSynologyEndpointAllowed(method: string, url: string | URL): void {
  const raw = typeof url === "string" ? url : url.href;
  assertSafeRawUrl(raw);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    reject("DSM endpoint URL is invalid");
  }
  if (parsed.hash) reject("DSM endpoint fragment is not allowed");
  if (
    parsed.pathname.includes("..") ||
    parsed.pathname.includes("//") ||
    parsed.pathname.includes("\\")
  )
    reject("DSM path traversal is not allowed");
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET" && normalizedMethod !== "POST")
    reject("DSM method is not allowed");
  const httpMethod = normalizedMethod as SynologyHttpMethod;
  if (!CGI_PATH.test(parsed.pathname)) reject("DSM endpoint is not on the Phase 9 allowlist");
  const keys = uniqueQueryKeys(parsed);
  for (const key of keys)
    if (DENIED_QUERY_KEYS.has(key.toLocaleLowerCase("und")))
      reject(`DSM query parameter ${key} is not allowed`);

  if (httpMethod === "POST") {
    if (keys.length > 0) reject("DSM authentication POST must not use query parameters");
    return;
  }

  const api = parsed.searchParams.get("api") ?? "";
  const dsmMethod = parsed.searchParams.get("method") ?? "";
  if (dsmMethod === "login" || dsmMethod === "logout")
    reject("DSM authentication must use POST without credentials in the URL");
  if (dsmMethod === "reboot" || dsmMethod === "shutdown")
    reject("DSM destructive methods are not allowed");

  if (api === "SYNO.API.Info" && dsmMethod === "query") {
    requireExactQuery(parsed, {
      api: /^SYNO\.API\.Info$/u,
      version: /^1$/u,
      method: /^query$/u,
      query: new RegExp(`^${INFO_QUERY.replaceAll(".", String.raw`\.`)}$`, "u"),
    });
    return;
  }
  if (api === "SYNO.DSM.Info" && dsmMethod === "getinfo") {
    requireExactQuery(parsed, {
      api: /^SYNO\.DSM\.Info$/u,
      version: /^[12]$/u,
      method: /^getinfo$/u,
    });
    return;
  }
  if (api === "SYNO.Core.System" && dsmMethod === "info") {
    requireExactQuery(parsed, {
      api: /^SYNO\.Core\.System$/u,
      version: /^[1-3]$/u,
      method: /^info$/u,
    });
    return;
  }
  if (api === "SYNO.Core.System.Utilization" && dsmMethod === "get") {
    requireExactQuery(parsed, {
      api: /^SYNO\.Core\.System\.Utilization$/u,
      version: /^1$/u,
      method: /^get$/u,
    });
    return;
  }
  if (api === "SYNO.Storage.CGI.Storage" && dsmMethod === "load_info") {
    requireExactQuery(parsed, {
      api: /^SYNO\.Storage\.CGI\.Storage$/u,
      version: /^1$/u,
      method: /^load_info$/u,
    });
    return;
  }
  reject("DSM endpoint is not on the Phase 9 allowlist");
}
