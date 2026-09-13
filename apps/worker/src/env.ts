import { isRedisUrl, parseListenAddress } from "@dashboard/events";
import type { WorkerOptions } from "./server";

export function workerOptionsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): WorkerOptions {
  const listen = parseListenAddress(env, "WORKER");
  const redisRaw = env.REDIS_URL?.trim();
  if (redisRaw && !isRedisUrl(redisRaw)) {
    throw new Error("INVALID_REDIS_URL");
  }
  return {
    host: listen.host,
    port: listen.port,
    ...(redisRaw ? { redisUrl: redisRaw } : {}),
  };
}
