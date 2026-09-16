/* Homelab Dashboard — secure service worker (no authenticated HTML / API caches). */
/* eslint-disable no-restricted-globals */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `homelab-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `homelab-static-${CACHE_VERSION}`;
const STATIC_CACHE_MAX_ENTRIES = 64;

const PRECACHE_URLS = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"];

const SENSITIVE_PREFIXES = [
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
  "/backup",
];

const ALLOWED_SHELL = new Set(["/offline.html", "/manifest.webmanifest", "/favicon.ico"]);

function normalizePathname(url) {
  try {
    return new URL(url, self.location.origin).pathname;
  } catch {
    return "/";
  }
}

function isSensitivePath(pathname) {
  const path = pathname.toLowerCase();
  if (path === "/api" || path.startsWith("/api/")) return true;
  return SENSITIVE_PREFIXES.some((prefix) => {
    const normalized = prefix.toLowerCase();
    if (path === normalized) return true;
    if (normalized.endsWith("/")) return path.startsWith(normalized);
    return path.startsWith(`${normalized}/`);
  });
}

function isAllowedStaticAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/icons/")) return true;
  if (ALLOWED_SHELL.has(pathname)) return true;
  return false;
}

function decideCachePolicy(request) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return "ignore";

  const pathname = normalizePathname(request.url);
  const destination = request.destination || "";
  const mode = request.mode || "cors";
  const isNavigation =
    mode === "navigate" || destination === "document" || destination === "iframe";

  if (isNavigation) {
    if (pathname === "/offline.html") return "cache-first-static";
    return "navigation-network-first";
  }

  if (isSensitivePath(pathname)) return "network-only";

  if (isAllowedStaticAsset(pathname)) return "cache-first-static";

  return "network-only";
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const excess = keys.length - maxEntries;
  await Promise.all(keys.slice(0, excess).map((request) => cache.delete(request)));
}

async function putBounded(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await trimCache(cacheName, STATIC_CACHE_MAX_ENTRIES);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(PRECACHE_URLS);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const allowed = new Set([SHELL_CACHE, STATIC_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (allowed.has(name)) return undefined;
          return caches.delete(name);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const decision = decideCachePolicy(event.request);
  if (decision === "ignore") return;

  if (decision === "network-only") {
    event.respondWith(fetch(event.request));
    return;
  }

  if (decision === "navigation-network-first") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request);
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const offline = await cache.match("/offline.html");
          if (offline) return offline;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // cache-first-static
  event.respondWith(
    (async () => {
      const pathname = normalizePathname(event.request.url);
      const shellPreferred =
        pathname === "/offline.html" ||
        pathname === "/manifest.webmanifest" ||
        pathname.startsWith("/icons/");
      const primary = shellPreferred ? SHELL_CACHE : STATIC_CACHE;
      const secondary = shellPreferred ? STATIC_CACHE : SHELL_CACHE;

      const cached =
        (await caches.match(event.request, { cacheName: primary })) ||
        (await caches.match(event.request, { cacheName: secondary }));
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok && (response.type === "basic" || response.type === "cors")) {
        await putBounded(primary, event.request, response.clone());
      }
      return response;
    })(),
  );
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Homelab Dashboard",
    body: "You have a new notification",
    tag: "homelab-notification",
    data: { path: "/notifications" },
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      if (parsed && typeof parsed === "object") {
        payload = {
          title:
            typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : payload.title,
          body: typeof parsed.body === "string" && parsed.body.trim() ? parsed.body : payload.body,
          tag: typeof parsed.tag === "string" && parsed.tag.trim() ? parsed.tag : payload.tag,
          data:
            parsed.data && typeof parsed.data === "object"
              ? {
                  path:
                    typeof parsed.data.path === "string" && parsed.data.path.startsWith("/")
                      ? parsed.data.path
                      : "/notifications",
                }
              : payload.data,
        };
      }
    }
  } catch {
    // Keep conservative defaults when payload is missing or invalid.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: payload.data,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawPath =
    event.notification &&
    event.notification.data &&
    typeof event.notification.data.path === "string"
      ? event.notification.data.path
      : "/notifications";
  const path = rawPath.startsWith("/") && !rawPath.includes("://") ? rawPath : "/notifications";
  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Older clients may reject navigate; open a new window instead.
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
    })(),
  );
});
