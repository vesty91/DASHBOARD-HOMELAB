import { createClient, type RedisClientType } from "redis";
import { MemoryEventBus, type EventBus } from "./memory-bus";
import { RedisEventBus, type RedisPubSubPort } from "./redis-bus";

const CONNECT_TIMEOUT_MS = 2_000;

function ignoreClientErrors(client: RedisClientType): void {
  client.on("error", () => undefined);
}

export async function createRedisPubSubPort(
  url: string,
  timeoutMs = CONNECT_TIMEOUT_MS,
): Promise<RedisPubSubPort> {
  const publisher = createClient({
    url,
    socket: { connectTimeout: timeoutMs },
  });
  const subscriber = createClient({
    url,
    socket: { connectTimeout: timeoutMs },
  });
  ignoreClientErrors(publisher);
  ignoreClientErrors(subscriber);
  await publisher.connect();
  await subscriber.connect();

  return {
    async publish(channel, message) {
      await publisher.publish(channel, message);
    },
    async subscribe(channel, listener) {
      await subscriber.subscribe(channel, listener);
      return async () => {
        await subscriber.unsubscribe(channel);
      };
    },
    async ping() {
      try {
        const reply = await publisher.ping();
        return reply === "PONG";
      } catch {
        return false;
      }
    },
    async close() {
      await Promise.allSettled([publisher.close(), subscriber.close()]);
    },
  };
}

export async function pingRedisUrl(url: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<boolean> {
  try {
    const port = await createRedisPubSubPort(url, timeoutMs);
    try {
      return await port.ping();
    } finally {
      await port.close();
    }
  } catch {
    return false;
  }
}

export async function createConfiguredEventBus(redisUrl?: string): Promise<EventBus> {
  if (!redisUrl) return new MemoryEventBus();
  return new RedisEventBus(await createRedisPubSubPort(redisUrl));
}
