export function parseListenAddress(
  env: Readonly<Record<string, string | undefined>>,
  prefix: "WORKER" | "REALTIME",
): { host: string; port: number } {
  const hostRaw = env[`${prefix}_HOST`];
  const host = hostRaw && hostRaw.trim().length > 0 ? hostRaw.trim() : "0.0.0.0";
  const portRaw = env[`${prefix}_PORT`];
  const fallback = prefix === "WORKER" ? 3001 : 3002;
  const port =
    portRaw === undefined || portRaw.trim() === "" ? fallback : Number.parseInt(portRaw, 10);
  if (!host || host.length > 253) throw new Error("INVALID_LISTEN_HOST");
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("INVALID_LISTEN_PORT");
  return { host, port };
}
