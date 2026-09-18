/** Cache version — bump when shell assets or offline page change. */
export const PWA_CACHE_VERSION = "v2";

export const PWA_SHELL_CACHE = `homelab-shell-${PWA_CACHE_VERSION}`;
export const PWA_STATIC_CACHE = `homelab-static-${PWA_CACHE_VERSION}`;

/** Soft upper bound on entries kept in the static asset cache. */
export const PWA_STATIC_CACHE_MAX_ENTRIES = 64;

const SENSITIVE_PATH_PREFIXES = [
  "/api/",
  "/api/auth",
  "/api/trpc",
  "/api/realtime",
  "/trpc",
  "/auth",
  "/login",
  "/logout",
  "/setup",
  "/account",
  "/admin",
  "/boards",
  "/apps",
  "/integrations",
  "/automations",
  "/notifications",
  "/incidents",
  "/status-pages",
  "/status",
  "/reliability",
  "/topology",
  "/backup",
] as const;

const ALLOWED_SHELL_PATHS = new Set(["/offline.html", "/manifest.webmanifest", "/favicon.ico"]);

function normalizePathname(input: string): string {
  try {
    if (input.startsWith("http://") || input.startsWith("https://")) {
      return new URL(input).pathname;
    }
  } catch {
    return "/";
  }
  const path = input.split("?")[0]?.split("#")[0] ?? "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function isSensitivePath(pathname: string): boolean {
  const path = normalizePathname(pathname).toLowerCase();
  if (path === "/api" || path.startsWith("/api/")) return true;
  return SENSITIVE_PATH_PREFIXES.some((prefix) => {
    const normalized = prefix.toLowerCase();
    if (path === normalized) return true;
    if (normalized.endsWith("/")) return path.startsWith(normalized);
    return path.startsWith(`${normalized}/`);
  });
}

export function isAllowedStaticAsset(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path.startsWith("/_next/static/")) return true;
  if (path.startsWith("/icons/")) return true;
  if (path.startsWith("/branding/")) return true;
  if (ALLOWED_SHELL_PATHS.has(path)) return true;
  return false;
}

export type PwaCacheDecision =
  "cache-first-static" | "network-only" | "navigation-network-first" | "ignore";

export function decideCachePolicy(request: {
  url: string;
  method?: string;
  mode?: string;
  destination?: string;
  credentials?: string;
  headers?: { get(name: string): string | null };
}): PwaCacheDecision {
  const method = (request.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return "ignore";

  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return "network-only";
  }

  const destination = request.destination ?? "";
  const mode = request.mode ?? "cors";
  const isNavigation =
    mode === "navigate" || destination === "document" || destination === "iframe";

  if (isNavigation) {
    if (pathname === "/offline.html") return "cache-first-static";
    return "navigation-network-first";
  }

  if (isSensitivePath(pathname)) return "network-only";

  if (isAllowedStaticAsset(pathname)) return "cache-first-static";

  const cookieHeader = request.headers?.get("cookie");
  if (cookieHeader && cookieHeader.length > 0) return "network-only";
  if (request.credentials === "include") return "network-only";

  return "network-only";
}

export function shouldPreCacheUrl(pathname: string): boolean {
  return isAllowedStaticAsset(pathname) && !isSensitivePath(pathname);
}
