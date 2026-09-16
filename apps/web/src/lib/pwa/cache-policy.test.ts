import { describe, expect, it } from "vitest";
import {
  decideCachePolicy,
  isAllowedStaticAsset,
  isSensitivePath,
  PWA_CACHE_VERSION,
  PWA_SHELL_CACHE,
  PWA_STATIC_CACHE,
  PWA_STATIC_CACHE_MAX_ENTRIES,
  shouldPreCacheUrl,
} from "./cache-policy";

describe("PWA cache policy", () => {
  it("versions cache names and bounds static cache size", () => {
    expect(PWA_CACHE_VERSION).toBe("v1");
    expect(PWA_SHELL_CACHE).toContain(PWA_CACHE_VERSION);
    expect(PWA_STATIC_CACHE).toContain(PWA_CACHE_VERSION);
    expect(PWA_STATIC_CACHE_MAX_ENTRIES).toBeGreaterThan(0);
    expect(PWA_STATIC_CACHE_MAX_ENTRIES).toBeLessThanOrEqual(128);
  });

  it("allows only static shell assets", () => {
    expect(isAllowedStaticAsset("/_next/static/chunks/app.js")).toBe(true);
    expect(isAllowedStaticAsset("/icons/icon-192.png")).toBe(true);
    expect(isAllowedStaticAsset("/offline.html")).toBe(true);
    expect(isAllowedStaticAsset("/manifest.webmanifest")).toBe(true);
    expect(isAllowedStaticAsset("/favicon.ico")).toBe(true);
    expect(isAllowedStaticAsset("/boards")).toBe(false);
    expect(isAllowedStaticAsset("/api/trpc/boards.list")).toBe(false);
  });

  it("denies API, auth, realtime, notifications, integrations, automations, backup paths", () => {
    const denied = [
      "/api/trpc/boards.list",
      "/api/auth/session",
      "/api/realtime/ws",
      "/auth/callback",
      "/login",
      "/logout",
      "/setup",
      "/account",
      "/admin/backup",
      "/boards/home",
      "/integrations",
      "/automations",
      "/notifications",
      "/incidents",
      "/backup",
    ];
    for (const path of denied) {
      expect(isSensitivePath(path)).toBe(true);
      expect(shouldPreCacheUrl(path)).toBe(false);
      expect(
        decideCachePolicy({
          url: `https://dashboard.example${path}`,
          method: "GET",
          mode: "cors",
          destination: "empty",
        }),
      ).toBe("network-only");
    }
  });

  it("uses network-first navigation and never caches authenticated HTML", () => {
    expect(
      decideCachePolicy({
        url: "https://dashboard.example/boards",
        method: "GET",
        mode: "navigate",
        destination: "document",
        credentials: "include",
        headers: { get: (name) => (name.toLowerCase() === "cookie" ? "session=abc" : null) },
      }),
    ).toBe("navigation-network-first");

    expect(
      decideCachePolicy({
        url: "https://dashboard.example/offline.html",
        method: "GET",
        mode: "navigate",
        destination: "document",
      }),
    ).toBe("cache-first-static");
  });

  it("cache-first only for allowlisted static GET assets without cookies", () => {
    expect(
      decideCachePolicy({
        url: "https://dashboard.example/_next/static/css/app.css",
        method: "GET",
        mode: "cors",
        destination: "style",
      }),
    ).toBe("cache-first-static");

    expect(
      decideCachePolicy({
        url: "https://dashboard.example/icons/icon-512.png",
        method: "GET",
        destination: "image",
        credentials: "include",
        headers: { get: (name) => (name.toLowerCase() === "cookie" ? "session=abc" : null) },
      }),
    ).toBe("cache-first-static");

    expect(
      decideCachePolicy({
        url: "https://dashboard.example/some-unknown.json",
        method: "GET",
        destination: "empty",
        headers: { get: (name) => (name.toLowerCase() === "cookie" ? "session=abc" : null) },
      }),
    ).toBe("network-only");

    expect(
      decideCachePolicy({
        url: "https://dashboard.example/api/trpc/health",
        method: "POST",
        mode: "cors",
      }),
    ).toBe("ignore");
  });
});
