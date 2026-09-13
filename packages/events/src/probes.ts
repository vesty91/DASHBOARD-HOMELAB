import { connect } from "node:net";

export async function probeRedisUrl(url: string, timeoutMs = 2_000): Promise<boolean> {
  let hostname: string;
  let port: number;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") return false;
    hostname = parsed.hostname;
    port = Number(parsed.port || 6379);
  } catch {
    return false;
  }
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65_535) return false;
  return await new Promise((resolve) => {
    const socket = connect({ host: hostname, port });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      finish(true);
    });
    socket.once("error", () => {
      clearTimeout(timer);
      finish(false);
    });
  });
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
