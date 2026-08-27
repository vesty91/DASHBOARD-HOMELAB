import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { performance } from "node:perf_hooks";

export type HealthErrorCode =
  "HTTP_STATUS" | "TIMEOUT" | "DNS_ERROR" | "TLS_ERROR" | "CONNECTION_ERROR" | "TARGET_BLOCKED";
export type HealthStatus = "up" | "down" | "timeout" | "error";
export interface ProbeResult {
  status: HealthStatus;
  latencyMs: number;
  httpStatus: number | null;
  errorCode: HealthErrorCode | null;
}
export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type AddressResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;
export interface ProbeOptions {
  url: URL;
  method: "GET" | "HEAD";
  timeoutMs: number;
  expectedStatusMin: number;
  expectedStatusMax: number;
  resolver?: AddressResolver;
  allowAddress?: (address: string) => boolean;
}

const ipv4Number = (address: string) =>
  address.split(".").reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
const ipv4In = (address: string, base: string, bits: number) => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(base) & mask);
};
export function isAllowedHealthAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4)
    return !(
      address === "0.0.0.0" ||
      ipv4In(address, "127.0.0.0", 8) ||
      ipv4In(address, "169.254.0.0", 16) ||
      ipv4In(address, "224.0.0.0", 4) ||
      ipv4In(address, "240.0.0.0", 4)
    );
  if (family === 6) {
    const ip = address.toLowerCase().split("%")[0] ?? "";
    return !(ip === "::" || ip === "::1" || /^(fe[89ab]|ff)/.test(ip));
  }
  return false;
}
export const systemResolver: AddressResolver = async (hostname) =>
  (await dns.lookup(hostname, { all: true, verbatim: true })).map(({ address, family }) => ({
    address,
    family: family as 4 | 6,
  }));
const failure = (
  started: number,
  status: HealthStatus,
  errorCode: HealthErrorCode,
): ProbeResult => ({
  status,
  latencyMs: Math.max(0, Math.round(performance.now() - started)),
  httpStatus: null,
  errorCode,
});

export async function probeHttp(options: ProbeOptions): Promise<ProbeResult> {
  const started = performance.now();
  if (!["http:", "https:"].includes(options.url.protocol))
    return failure(started, "error", "TARGET_BLOCKED");
  const hostname = options.url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost"))
    return failure(started, "error", "TARGET_BLOCKED");
  let addresses: readonly ResolvedAddress[];
  try {
    addresses = net.isIP(hostname)
      ? [{ address: hostname, family: net.isIP(hostname) as 4 | 6 }]
      : await (options.resolver ?? systemResolver)(hostname);
  } catch {
    return failure(started, "error", "DNS_ERROR");
  }
  const allow = options.allowAddress ?? isAllowedHealthAddress;
  if (!addresses.length || addresses.some(({ address }) => !allow(address)))
    return failure(started, "error", "TARGET_BLOCKED");
  const pinned = [...addresses].sort((a, b) => a.address.localeCompare(b.address))[0]!;
  const client = options.url.protocol === "https:" ? https : http;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ProbeResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    const requestOptions = {
      method: options.method,
      headers: { "user-agent": "Dashboard-Healthcheck/1", accept: "*/*" },
      timeout: options.timeoutMs,
      autoSelectFamily: false,
      servername: options.url.protocol === "https:" ? hostname : undefined,
      lookup: (
        _hostname: string,
        _lookupOptions: object,
        callback: (error: null, address: string, family: number) => void,
      ) => callback(null, pinned.address, pinned.family),
    };
    const request = client.request(options.url, requestOptions, (response) => {
      const latencyMs = Math.max(0, Math.round(performance.now() - started));
      const statusCode = response.statusCode ?? 0;
      response.destroy();
      const up = statusCode >= options.expectedStatusMin && statusCode <= options.expectedStatusMax;
      finish({
        status: up ? "up" : "down",
        latencyMs,
        httpStatus: statusCode,
        errorCode: up ? null : "HTTP_STATUS",
      });
    });
    request.on("timeout", () =>
      request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
    );
    request.on("error", (error: NodeJS.ErrnoException) => {
      const code = error.code ?? "";
      if (code === "ETIMEDOUT") finish(failure(started, "timeout", "TIMEOUT"));
      else if (code.startsWith("ERR_TLS") || code.includes("CERT"))
        finish(failure(started, "error", "TLS_ERROR"));
      else finish(failure(started, "error", "CONNECTION_ERROR"));
    });
    request.end();
  });
}
