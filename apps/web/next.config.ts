import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { securityHeaders, serverActionAllowedOrigins } from "./src/lib/security-headers";

const realtimeUrl = process.env.REALTIME_URL?.replace(/\/$/u, "");
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const configDir = path.dirname(fileURLToPath(import.meta.url));

const allowUnsafeEval = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(configDir, "../.."),
  // Localhost vs 127.0.0.1: allow HMR when the browser origin differs from the
  // host Next binds to (otherwise client auth forms can fail to hydrate).
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.1.108"],
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
      allowedOrigins: serverActionAllowedOrigins(appUrl),
    },
  },
  async headers() {
    const noCache = [
      { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
      { key: "Pragma", value: "no-cache" },
    ];
    return [
      {
        source: "/:path*",
        headers: securityHeaders(appUrl, { allowUnsafeEval }),
      },
      { source: "/sw.js", headers: noCache },
      { source: "/manifest.webmanifest", headers: noCache },
    ];
  },
  async rewrites() {
    if (!realtimeUrl) return [];
    return [{ source: "/api/realtime/ws", destination: `${realtimeUrl}/ws` }];
  },
};

export default nextConfig;
