import { isRedisUrl, parseListenAddress } from "@dashboard/events";
import type { RealtimeOptions } from "./server";

export function realtimeOptionsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): RealtimeOptions {
  const listen = parseListenAddress(env, "REALTIME");
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET_TOO_SHORT");
  }
  const redisRaw = env.REDIS_URL?.trim();
  if (redisRaw && !isRedisUrl(redisRaw)) {
    throw new Error("INVALID_REDIS_URL");
  }
  const appUrl = env.APP_URL?.trim();
  return {
    secret,
    host: listen.host,
    port: listen.port,
    ...(redisRaw ? { redisUrl: redisRaw } : {}),
    ...(appUrl ? { allowedOrigin: appUrl } : {}),
  };
}
