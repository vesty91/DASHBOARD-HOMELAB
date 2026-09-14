import type { NextConfig } from "next";

const realtimeUrl = process.env.REALTIME_URL?.replace(/\/$/u, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    if (!realtimeUrl) return [];
    return [{ source: "/api/realtime/ws", destination: `${realtimeUrl}/ws` }];
  },
};

export default nextConfig;
