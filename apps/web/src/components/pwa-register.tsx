"use client";

import { useEffect } from "react";

/**
 * Registers the secure Restor_Pc service worker.
 * Skips when Service Worker API is missing or the page is not a secure context.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    // Playwright sets webdriver; PWA e2e registers explicitly when needed.
    if (navigator.webdriver) return;

    let cancelled = false;

    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      if (cancelled) return;
      console.warn("[pwa] service worker registration failed", error);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
