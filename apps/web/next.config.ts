import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { securityHeaders, serverActionAllowedOrigins } from "./src/lib/security-headers";

const realtimeUrl = process.env.REALTIME_URL?.replace(/\/$/u, "");
const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(configDir, "../.."),
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
      allowedOrigins: serverActionAllowedOrigins(appUrl),
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders(appUrl) }];
  },
  async rewrites() {
    if (!realtimeUrl) return [];
    return [{ source: "/api/realtime/ws", destination: `${realtimeUrl}/ws` }];
  },
};

export default nextConfig;
