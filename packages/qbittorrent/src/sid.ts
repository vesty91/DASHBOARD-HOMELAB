import { IntegrationError } from "@dashboard/integrations";

const SID_VALUE = /^[\u0021-\u007E]{1,256}$/u;

function invalidSid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseQbittorrentSid(setCookie: readonly string[] | undefined): string {
  if (!setCookie || setCookie.length === 0)
    invalidSid("qBittorrent login did not return a SID cookie");
  for (const header of setCookie) {
    const pair = header.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    if (name !== "SID") continue;
    const value = pair.slice(separator + 1).trim();
    if (!SID_VALUE.test(value)) invalidSid("qBittorrent SID cookie is invalid");
    return value;
  }
  invalidSid("qBittorrent login did not return a SID cookie");
}

export function qbittorrentCookieHeader(sid: string): string {
  if (!SID_VALUE.test(sid)) invalidSid("qBittorrent SID cookie is invalid");
  return `SID=${sid}`;
}
