import { pingRedisUrl } from "./redis-port";

export async function probeRedisUrl(url: string, timeoutMs = 2_000): Promise<boolean> {
  return pingRedisUrl(url, timeoutMs);
}

export async function probeHttpReady(url: string, timeoutMs = 2_000): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
    });
    return response.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
